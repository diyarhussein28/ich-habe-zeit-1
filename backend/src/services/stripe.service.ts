import Stripe from 'stripe'
import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'

const STRIPE_API_VERSION = '2026-07-29.dahlia' as const

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION,
  typescript: true,
})

// ─── Stripe Customer (required to save cards for reuse) ──────────────────────

export async function ensureStripeCustomer(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('USER_NOT_FOUND')
  if (user.stripeCustomerId) return user.stripeCustomerId

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.displayName,
    metadata: { userId },
  })

  await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } })
  return customer.id
}

// ─── Saved payment methods ────────────────────────────────────────────────────

export async function createSetupIntent(userId: string) {
  const customerId = await ensureStripeCustomer(userId)
  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
  })
  return { clientSecret: setupIntent.client_secret!, customerId }
}

export async function listSavedPaymentMethods(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.stripeCustomerId) return { paymentMethods: [], defaultPaymentMethodId: null }

  const [methods, customer] = await Promise.all([
    stripe.paymentMethods.list({ customer: user.stripeCustomerId, type: 'card' }),
    stripe.customers.retrieve(user.stripeCustomerId),
  ])

  const defaultPaymentMethodId =
    !customer.deleted && typeof customer.invoice_settings?.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : null

  return {
    paymentMethods: methods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? 'unknown',
      last4: pm.card?.last4 ?? '****',
      expMonth: pm.card?.exp_month ?? 0,
      expYear: pm.card?.exp_year ?? 0,
      isDefault: pm.id === defaultPaymentMethodId,
    })),
    defaultPaymentMethodId,
  }
}

async function assertOwnsPaymentMethod(userId: string, paymentMethodId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.stripeCustomerId) throw new Error('NO_STRIPE_CUSTOMER')

  const pm = await stripe.paymentMethods.retrieve(paymentMethodId)
  if (pm.customer !== user.stripeCustomerId) throw new Error('FORBIDDEN')
  return user.stripeCustomerId
}

export async function deleteSavedPaymentMethod(userId: string, paymentMethodId: string) {
  await assertOwnsPaymentMethod(userId, paymentMethodId)
  await stripe.paymentMethods.detach(paymentMethodId)
}

export async function setDefaultPaymentMethod(userId: string, paymentMethodId: string) {
  const customerId = await assertOwnsPaymentMethod(userId, paymentMethodId)
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  })
}

// ─── Payment Intent (escrow hold) ────────────────────────────────────────────

export async function createPaymentIntentForOrder(orderId: string, userId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId: userId, status: 'AWAITING_PAYMENT' },
    include: { request: true },
  })
  if (!order) throw new Error('ORDER_NOT_FOUND')

  const amountCents = Math.round(order.grossAmount * 100)
  const customerId = await ensureStripeCustomer(userId)

  const [pi, ephemeralKey] = await Promise.all([
    stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'eur',
      capture_method: 'manual', // hold funds, capture on release
      customer: customerId,
      setup_future_usage: 'off_session', // lets the customer save/reuse this card
      metadata: {
        orderId,
        customerId: userId,
        requestTitle: order.request.title.slice(0, 100),
      },
      description: `Ich habe Zeit – ${order.request.title.slice(0, 100)}`,
    }),
    // Required by the mobile PaymentSheet SDK to securely list/reuse this customer's saved cards
    stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: STRIPE_API_VERSION }),
  ])

  // Store the PI id on the order
  await prisma.order.update({
    where: { id: orderId },
    data: { mangopayPayInId: pi.id },
  })

  return {
    clientSecret: pi.client_secret!,
    paymentIntentId: pi.id,
    customerId,
    ephemeralKeySecret: ephemeralKey.secret!,
  }
}

// ─── Confirm payment after mobile PaymentSheet success ───────────────────────

export async function confirmOrderPayment(orderId: string, paymentIntentId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, mangopayPayInId: paymentIntentId, status: 'AWAITING_PAYMENT' },
  })
  if (!order) throw new Error('ORDER_NOT_FOUND')

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId)

  if (pi.status !== 'requires_capture') {
    throw new Error(`PAYMENT_NOT_CONFIRMED: status=${pi.status}`)
  }

  const releaseDeadline = new Date()
  releaseDeadline.setHours(releaseDeadline.getHours() + order.releaseWindowHours)

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'IN_PROGRESS',
        paymentStatus: 'CAPTURED',
        releaseDeadline,
        mangopayEscrowWalletId: `stripe_held_${paymentIntentId}`,
      },
    })

    await tx.serviceRequest.update({
      where: { id: order.requestId },
      data: { status: 'IN_PROGRESS' },
    })

    await tx.orderStatusHistory.create({
      data: { orderId, status: 'IN_PROGRESS', triggeredBy: 'stripe_payment' },
    })

    const chat = await tx.chat.findUnique({ where: { orderId } })
    if (chat) {
      await tx.chatMessage.create({
        data: {
          chatId: chat.id,
          senderId: 'system',
          content: 'Zahlung erfolgreich eingegangen. Der Auftrag ist jetzt aktiv.',
          isSystem: true,
        },
      })
    }

    return updated
  })
}

// ─── Release: capture PI + transfer to provider ───────────────────────────────

export async function releaseOrderPayment(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      offer: { include: { provider: true } },
    },
  })
  if (!order) throw new Error('ORDER_NOT_FOUND')

  // Dev simulate: no real PaymentIntent — skip Stripe entirely
  if (!order.mangopayPayInId || order.mangopayEscrowWalletId === 'simulated') {
    return { transferId: undefined }
  }

  const pi = await stripe.paymentIntents.retrieve(order.mangopayPayInId)
  if (!['requires_capture', 'succeeded'].includes(pi.status)) {
    throw new Error(`CANNOT_RELEASE: status=${pi.status}`)
  }

  let capturedPi = pi
  if (pi.status === 'requires_capture') {
    capturedPi = await stripe.paymentIntents.capture(order.mangopayPayInId)
  }

  // Transfer net provider amount to their Connect account (if onboarded)
  const providerStripeId = order.offer.provider.stripeConnectAccountId
  let transferId: string | undefined

  if (providerStripeId && order.offer.provider.stripeConnectEnabled) {
    const chargeId =
      typeof capturedPi.latest_charge === 'string'
        ? capturedPi.latest_charge
        : capturedPi.latest_charge?.id

    const transfer = await stripe.transfers.create({
      amount: Math.round(order.netProviderAmount * 100),
      currency: 'eur',
      destination: providerStripeId,
      ...(chargeId ? { source_transaction: chargeId } : {}),
      metadata: { orderId },
    })
    transferId = transfer.id
  }

  return { transferId }
}

// ─── Full refund: cancel (if not yet captured) or refund (if captured) ────────

export async function refundOrderPayment(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('ORDER_NOT_FOUND')

  if (!order.mangopayPayInId || order.mangopayEscrowWalletId === 'simulated') {
    return { refundId: undefined }
  }

  const pi = await stripe.paymentIntents.retrieve(order.mangopayPayInId)

  if (pi.status === 'requires_capture') {
    await stripe.paymentIntents.cancel(order.mangopayPayInId)
    return { refundId: undefined }
  }
  if (pi.status !== 'succeeded') {
    throw new Error(`CANNOT_REFUND: status=${pi.status}`)
  }

  const refund = await stripe.refunds.create({
    payment_intent: order.mangopayPayInId,
    metadata: { orderId },
  })
  return { refundId: refund.id }
}

// ─── Partial release: capture + transfer part to provider, refund the rest ────

export async function partialReleaseOrderPayment(orderId: string, releasedAmount: number) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { offer: { include: { provider: true } } },
  })
  if (!order) throw new Error('ORDER_NOT_FOUND')

  if (!order.mangopayPayInId || order.mangopayEscrowWalletId === 'simulated') {
    return { transferId: undefined, refundId: undefined }
  }

  const pi = await stripe.paymentIntents.retrieve(order.mangopayPayInId)
  if (!['requires_capture', 'succeeded'].includes(pi.status)) {
    throw new Error(`CANNOT_RELEASE: status=${pi.status}`)
  }

  let capturedPi = pi
  if (pi.status === 'requires_capture') {
    capturedPi = await stripe.paymentIntents.capture(order.mangopayPayInId)
  }

  const providerStripeId = order.offer.provider.stripeConnectAccountId
  let transferId: string | undefined

  if (providerStripeId && order.offer.provider.stripeConnectEnabled && releasedAmount > 0) {
    const chargeId =
      typeof capturedPi.latest_charge === 'string'
        ? capturedPi.latest_charge
        : capturedPi.latest_charge?.id

    const transfer = await stripe.transfers.create({
      amount: Math.round(releasedAmount * 100),
      currency: 'eur',
      destination: providerStripeId,
      ...(chargeId ? { source_transaction: chargeId } : {}),
      metadata: { orderId, type: 'partial_release' },
    })
    transferId = transfer.id
  }

  const refundAmount = Math.max(0, order.grossAmount - releasedAmount)
  let refundId: string | undefined

  if (refundAmount > 0) {
    const refund = await stripe.refunds.create({
      payment_intent: order.mangopayPayInId,
      amount: Math.round(refundAmount * 100),
      metadata: { orderId, type: 'partial_release' },
    })
    refundId = refund.id
  }

  return { transferId, refundId }
}

// ─── Stripe Connect onboarding ────────────────────────────────────────────────

export async function createConnectOnboardingLink(userId: string, returnUrl: string, refreshUrl: string) {
  const provider = await prisma.providerProfile.findUnique({
    where: { userId },
    include: { user: true },
  })
  if (!provider) throw new Error('PROVIDER_NOT_FOUND')

  let accountId = provider.stripeConnectAccountId

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'DE',
      email: provider.user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
        sepa_debit_payments: { requested: true },
      },
      business_profile: {
        name: provider.legalName ?? provider.user.displayName,
        product_description: 'Dienstleistungen über Ich habe Zeit',
      },
      settings: {
        payouts: { schedule: { interval: 'weekly', weekly_anchor: 'monday' } },
      },
    })
    accountId = account.id
    await prisma.providerProfile.update({
      where: { userId },
      data: { stripeConnectAccountId: accountId },
    })
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: 'account_onboarding',
  })

  return { url: link.url, accountId }
}

// ─── Webhook event handler ─────────────────────────────────────────────────────

export async function handleWebhookEvent(rawBody: Buffer, signature: string) {
  if (!env.STRIPE_WEBHOOK_SECRET || env.STRIPE_WEBHOOK_SECRET === 'whsec_test_placeholder') {
    // Dev mode: skip signature verification
    return JSON.parse(rawBody.toString()) as Stripe.Event
  }
  return stripe.webhooks.constructEventAsync(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)
}
