import { prisma } from '../config/prisma.js'
import { getEffectiveCommissionRate } from './category.service.js'
import { env } from '../config/env.js'
import type { OrderStatus } from '@prisma/client'

// ─── Accept offer & create order ─────────────────────────────────────────────

export async function acceptOffer(offerId: string, customerUserId: string) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { request: { include: { category: true, customer: true } } },
  })

  if (!offer) throw new Error('OFFER_NOT_FOUND')
  if (offer.request.customer.userId !== customerUserId) throw new Error('FORBIDDEN')
  if (offer.status !== 'PENDING') throw new Error('OFFER_NOT_PENDING')
  if (offer.validUntil < new Date()) throw new Error('OFFER_EXPIRED')
  if (!['OPEN', 'OFFER_RECEIVED'].includes(offer.request.status)) {
    throw new Error('REQUEST_NO_LONGER_OPEN')
  }

  const commissionRate = await getEffectiveCommissionRate(
    offer.request.categoryId,
    offer.request.addressCity ?? undefined
  )
  const grossAmount = offer.proposedPrice
  const commissionAmount = Math.max(grossAmount * commissionRate, 1.0)
  const vatOnCommission = commissionAmount * 0.19
  const netProviderAmount = grossAmount - commissionAmount

  const releaseDeadline = new Date()
  releaseDeadline.setHours(
    releaseDeadline.getHours() + env.DEFAULT_RELEASE_WINDOW_HOURS
  )

  const order = await prisma.$transaction(async (tx) => {
    // Reject all other pending offers for this request
    await tx.offer.updateMany({
      where: {
        requestId: offer.requestId,
        id: { not: offerId },
        status: 'PENDING',
      },
      data: { status: 'REJECTED' },
    })

    // Accept this offer
    await tx.offer.update({ where: { id: offerId }, data: { status: 'ACCEPTED' } })

    // Move request to AWAITING_PAYMENT
    await tx.serviceRequest.update({
      where: { id: offer.requestId },
      data: { status: 'AWAITING_PAYMENT' },
    })

    // Create the order
    const newOrder = await tx.order.create({
      data: {
        requestId: offer.requestId,
        offerId,
        customerId: offer.request.customer.userId,
        status: 'AWAITING_PAYMENT',
        grossAmount,
        commissionRate,
        commissionAmount,
        vatOnCommission,
        netProviderAmount,
        releaseWindowHours: env.DEFAULT_RELEASE_WINDOW_HOURS,
      },
    })

    // Create order chat
    await tx.chat.create({ data: { orderId: newOrder.id } })

    // Record initial status
    await tx.orderStatusHistory.create({
      data: {
        orderId: newOrder.id,
        status: 'AWAITING_PAYMENT',
        triggeredBy: customerUserId,
      },
    })

    return newOrder
  })

  return order
}

// ─── Payment capture (stub — Mangopay integration point) ─────────────────────

export async function capturePayment(orderId: string, customerUserId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId: customerUserId, status: 'AWAITING_PAYMENT' },
  })
  if (!order) throw new Error('ORDER_NOT_FOUND')

  // TODO: Call Mangopay PayIn API here
  // For now, stub the payment as captured
  const mangopayPayInId = `stub_payin_${Date.now()}`
  const mangopayEscrowWalletId = `stub_escrow_${orderId}`

  const releaseDeadline = new Date()
  releaseDeadline.setHours(releaseDeadline.getHours() + order.releaseWindowHours)

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'IN_PROGRESS',
        paymentStatus: 'CAPTURED',
        mangopayPayInId,
        mangopayEscrowWalletId,
        releaseDeadline,
      },
    })

    await tx.serviceRequest.update({
      where: { id: order.requestId },
      data: { status: 'IN_PROGRESS' },
    })

    await tx.orderStatusHistory.create({
      data: { orderId, status: 'IN_PROGRESS', triggeredBy: 'system' },
    })

    // Inject system message in chat
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

// ─── Provider marks job complete ─────────────────────────────────────────────

export async function markComplete(
  orderId: string,
  providerUserId: string,
  photoUrls: string[] = [],
  note?: string
) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      status: 'IN_PROGRESS',
      offer: { provider: { userId: providerUserId } },
    },
  })
  if (!order) throw new Error('ORDER_NOT_FOUND')

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'AWAITING_RELEASE',
        completedAt: new Date(),
        completionPhotoUrls: photoUrls,
        completionNote: note,
      },
    })

    await tx.serviceRequest.update({
      where: { id: order.requestId },
      data: { status: 'COMPLETED_BY_PROVIDER' },
    })

    await tx.orderStatusHistory.create({
      data: { orderId, status: 'AWAITING_RELEASE', triggeredBy: providerUserId },
    })

    const chat = await tx.chat.findUnique({ where: { orderId } })
    if (chat) {
      await tx.chatMessage.create({
        data: {
          chatId: chat.id,
          senderId: 'system',
          content: 'Der Anbieter hat die Arbeit als abgeschlossen markiert. Sie haben 72 Stunden, um die Zahlung freizugeben oder einen Streitfall zu eröffnen.',
          isSystem: true,
        },
      })
    }

    return updated
  })
}

// ─── Customer releases payment ────────────────────────────────────────────────

export async function releasePayment(orderId: string, customerUserId: string) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      customerId: customerUserId,
      status: 'AWAITING_RELEASE',
    },
  })
  if (!order) throw new Error('ORDER_NOT_FOUND')

  return prisma.$transaction(async (tx) => {
    // TODO: Call Mangopay split transfer here
    const mangopayTransferId = `stub_transfer_${Date.now()}`

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
        autoReleased: false,
        paymentStatus: 'RELEASED',
        mangopayTransferId,
        releasedAmount: order.netProviderAmount,
      },
    })

    await tx.serviceRequest.update({
      where: { id: order.requestId },
      data: { status: 'RELEASED' },
    })

    await tx.orderStatusHistory.create({
      data: { orderId, status: 'RELEASED', triggeredBy: customerUserId },
    })

    const chat = await tx.chat.findUnique({ where: { orderId } })
    if (chat) {
      await tx.chatMessage.create({
        data: {
          chatId: chat.id,
          senderId: 'system',
          content: 'Zahlung freigegeben. Vielen Dank für Ihre Nutzung von Ich habe Zeit!',
          isSystem: true,
        },
      })
    }

    return updated
  })
}

// ─── Auto-release (run by scheduled job) ─────────────────────────────────────

export async function processAutoReleases() {
  const expiredOrders = await prisma.order.findMany({
    where: {
      status: 'AWAITING_RELEASE',
      releaseDeadline: { lt: new Date() },
    },
    take: 50,
  })

  const results = await Promise.allSettled(
    expiredOrders.map(async (order) => {
      // TODO: Call Mangopay split transfer here
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'RELEASED',
            releasedAt: new Date(),
            autoReleased: true,
            paymentStatus: 'RELEASED',
            releasedAmount: order.netProviderAmount,
          },
        })

        await tx.serviceRequest.update({
          where: { id: order.requestId },
          data: { status: 'RELEASED' },
        })

        await tx.orderStatusHistory.create({
          data: { orderId: order.id, status: 'RELEASED', triggeredBy: 'system' },
        })
      })
    })
  )

  return {
    processed: expiredOrders.length,
    failed: results.filter((r) => r.status === 'rejected').length,
  }
}

// ─── Cancel order ─────────────────────────────────────────────────────────────

export async function cancelOrder(orderId: string, userId: string, isAdmin = false) {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('ORDER_NOT_FOUND')

  const isCustomer = order.customerId === userId
  if (!isCustomer && !isAdmin) throw new Error('FORBIDDEN')

  const cancellableStatuses: OrderStatus[] = ['AWAITING_PAYMENT', 'IN_PROGRESS']
  if (!cancellableStatuses.includes(order.status)) {
    throw new Error('CANNOT_CANCEL_AT_THIS_STAGE')
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    })

    await tx.serviceRequest.update({
      where: { id: order.requestId },
      data: { status: 'CANCELLED' },
    })

    await tx.orderStatusHistory.create({
      data: { orderId, status: 'CANCELLED', triggeredBy: userId },
    })

    return updated
  })
}

// ─── Get order details ────────────────────────────────────────────────────────

export async function getOrderById(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      request: { include: { category: true } },
      offer: {
        include: {
          provider: {
            include: { user: { select: { id: true, displayName: true, profilePhotoUrl: true } } },
          },
        },
      },
      statusHistory: { orderBy: { createdAt: 'asc' } },
      invoices: true,
      dispute: true,
    },
  })

  if (!order) throw new Error('NOT_FOUND')

  // Authorise: customer, provider, help desk, admin
  const isCustomer = order.customerId === userId
  const isProvider = order.offer.provider.userId === userId
  if (!isCustomer && !isProvider) throw new Error('FORBIDDEN')

  return order
}

export async function listOrdersForUser(userId: string, status?: OrderStatus) {
  return prisma.order.findMany({
    where: {
      customerId: userId,
      ...(status ? { status } : {}),
    },
    include: {
      request: { include: { category: { select: { id: true, name: true, iconUrl: true } } } },
      offer: {
        include: {
          provider: {
            include: { user: { select: { id: true, displayName: true, profilePhotoUrl: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function listOrdersForProvider(providerUserId: string, status?: OrderStatus) {
  const provider = await prisma.providerProfile.findUnique({ where: { userId: providerUserId } })
  if (!provider) throw new Error('NOT_FOUND')

  return prisma.order.findMany({
    where: {
      offer: { providerId: provider.id },
      ...(status ? { status } : {}),
    },
    include: {
      request: { include: { category: { select: { id: true, name: true, iconUrl: true } } } },
      offer: true,
      customer: { select: { id: true, displayName: true, profilePhotoUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}
