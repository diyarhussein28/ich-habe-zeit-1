import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth, requireRole } from '../middleware/auth.middleware.js'
import {
  createConnectOnboardingLink,
  handleWebhookEvent,
  confirmOrderPayment,
} from '../services/stripe.service.js'
import { openDisputeFromChargeback } from '../services/dispute.service.js'
import { prisma } from '../config/prisma.js'
import { env } from '../config/env.js'

export async function stripeRoutes(app: FastifyInstance) {
  // ── Connect onboarding ────────────────────────────────────────────────────

  // POST /api/stripe/connect/onboard — provider starts Stripe onboarding
  app.post(
    '/connect/onboard',
    { preHandler: requireAuth },
    async (request, reply) => {
      if (request.userRole !== 'PROVIDER') {
        return reply.status(403).send({ error: 'PROVIDERS_ONLY' })
      }

      const base = env.API_BASE_URL
      try {
        const result = await createConnectOnboardingLink(
          request.userId,
          `${base}/api/stripe/connect/return`,
          `${base}/api/stripe/connect/refresh`,
        )
        return reply.send(result)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'ERROR'
        return reply.status(400).send({ error: msg })
      }
    },
  )

  // GET /api/stripe/connect/return — Stripe redirects here after onboarding
  app.get('/connect/return', async (request, reply) => {
    const { account } = request.query as { account?: string }

    if (account) {
      const { stripe } = await import('../services/stripe.service.js')
      const stripeAccount = await stripe.accounts.retrieve(account)

      if (stripeAccount.charges_enabled) {
        await prisma.providerProfile.updateMany({
          where: { stripeConnectAccountId: account },
          data: { stripeConnectEnabled: true },
        })
      }
    }

    // Redirect back into the app via deep link
    return reply
      .header('Content-Type', 'text/html')
      .send(
        `<!DOCTYPE html><html><body>
         <p>Verbindung erfolgreich! Du kannst zu Ich habe Zeit zurückkehren.</p>
         <script>window.location.href = 'exp+ichhabezeit://stripe-connect-return'</script>
         </body></html>`,
      )
  })

  // GET /api/stripe/connect/refresh — re-generate onboarding link if expired
  app.get('/connect/refresh', { preHandler: requireAuth }, async (request, reply) => {
    if (request.userRole !== 'PROVIDER') {
      return reply.status(403).send({ error: 'PROVIDERS_ONLY' })
    }
    const base = env.API_BASE_URL
    try {
      const result = await createConnectOnboardingLink(
        request.userId,
        `${base}/api/stripe/connect/return`,
        `${base}/api/stripe/connect/refresh`,
      )
      return reply.redirect(result.url)
    } catch (err: unknown) {
      return reply.status(400).send({ error: 'REFRESH_FAILED' })
    }
  })

  // GET /api/stripe/connect/status — check if provider is onboarded
  app.get('/connect/status', { preHandler: requireAuth }, async (request, reply) => {
    const provider = await prisma.providerProfile.findUnique({
      where: { userId: request.userId },
      select: { stripeConnectAccountId: true, stripeConnectEnabled: true },
    })
    return reply.send({
      connected: !!provider?.stripeConnectAccountId,
      enabled: provider?.stripeConnectEnabled ?? false,
    })
  })

  // ── Webhook ───────────────────────────────────────────────────────────────
  // Registered as a sub-plugin with raw body parser so Stripe signature verifies

  app.register(async function webhookPlugin(sub) {
    sub.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => done(null, body),
    )

    sub.post('/webhook', async (request, reply) => {
      const sig = request.headers['stripe-signature'] as string
      let event
      try {
        event = await handleWebhookEvent(request.body as Buffer, sig)
      } catch (err) {
        return reply.status(400).send({ error: 'WEBHOOK_SIGNATURE_FAILED' })
      }

      try {
        switch (event.type) {
          case 'payment_intent.amount_capturable_updated': {
            // Fired when PaymentSheet confirms and funds are held — backup confirm
            const pi = event.data.object
            const orderId = pi.metadata?.orderId
            if (orderId) {
              const order = await prisma.order.findFirst({
                where: { id: orderId, status: 'AWAITING_PAYMENT' },
              })
              if (order) {
                await confirmOrderPayment(orderId, pi.id)
              }
            }
            break
          }

          case 'account.updated': {
            const account = event.data.object
            if (account.charges_enabled) {
              await prisma.providerProfile.updateMany({
                where: { stripeConnectAccountId: account.id },
                data: { stripeConnectEnabled: true },
              })
            }
            break
          }

          case 'charge.dispute.created': {
            // Bank-initiated chargeback — freeze the order the same way an
            // in-app dispute would, so payout can't happen while it's contested.
            const stripeDispute = event.data.object
            const paymentIntentId =
              typeof stripeDispute.payment_intent === 'string'
                ? stripeDispute.payment_intent
                : stripeDispute.payment_intent?.id
            if (paymentIntentId) {
              const order = await prisma.order.findFirst({
                where: { mangopayPayInId: paymentIntentId },
              })
              if (order) {
                await openDisputeFromChargeback(order.id, stripeDispute.id)
              }
            }
            break
          }
        }
      } catch (err) {
        console.error('[stripe webhook] handler error:', err)
      }

      return reply.send({ received: true })
    })
  })
}
