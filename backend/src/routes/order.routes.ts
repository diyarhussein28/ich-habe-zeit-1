import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as orderService from '../services/order.service.js'
import * as chatService from '../services/chat.service.js'
import * as disputeService from '../services/dispute.service.js'
import { requireAuth, requireVerified, requireRole } from '../middleware/auth.middleware.js'
import { notifyEvent } from '../services/notification.service.js'
import { flagUnusualRatingPattern } from '../services/moderation.service.js'
import { prisma } from '../config/prisma.js'
import {
  createPaymentIntentForOrder,
  confirmOrderPayment,
  releaseOrderPayment,
} from '../services/stripe.service.js'

const markCompleteSchema = z.object({
  photoUrls: z.array(z.string().url()).max(10).optional(),
  note: z.string().max(500).optional(),
})

const openDisputeSchema = z.object({
  reasonCategory: z.string().min(2),
  description: z.string().min(50).max(2000),
  intakeAnswers: z
    .array(z.object({ key: z.string(), question: z.string(), answer: z.string() }))
    .max(10)
    .optional(),
})

const respondDisputeSchema = z.object({
  agrees: z.boolean(),
  description: z.string().min(20).max(2000),
})

const addEvidenceSchema = z.object({
  fileUrl: z.string().url(),
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(100),
  fileSizeBytes: z.number().int().positive(),
})

const resolveDisputeSchema = z.object({
  outcome: z.enum(['FULL_RELEASE', 'PARTIAL_RELEASE', 'FULL_REFUND', 'REWORK_AGREEMENT', 'ESCALATED'] as const),
  resolutionNote: z.string().min(10),
  releasedAmount: z.number().positive().optional(),
})

const submitRatingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
})

export async function orderRoutes(app: FastifyInstance) {
  // POST /orders — accept offer → creates order
  app.post('/', { preHandler: requireVerified }, async (request, reply) => {
    if (request.userRole === 'ADMIN') return reply.status(403).send({ error: 'ADMINS_CANNOT_ACCEPT_OFFERS' })

    const body = z.object({ offerId: z.string().uuid() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    try {
      const order = await orderService.acceptOffer(body.data.offerId, request.userId)

      // Notify provider their offer was accepted
      const offer = await prisma.offer.findUnique({
        where: { id: body.data.offerId },
        include: { provider: true },
      })
      if (offer?.provider?.userId) {
        notifyEvent({
          userId: offer.provider.userId,
          pushType: 'OFFER_ACCEPTED',
          orderId: order.id,
          title: 'Angebot angenommen!',
          body: 'Dein Angebot wurde angenommen. Bitte lass die Zahlung bestätigen.',
        }).catch(() => {})
      }

      return reply.status(201).send({ order })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // GET /orders — list orders for current user
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const query = z
      .object({ status: z.string().optional(), perspective: z.enum(['customer', 'provider']).optional() })
      .parse(request.query)

    // Providers can also post their own requests as a customer (e.g. "+ Auftrag"
    // in der Jobbörse). The caller declares which side of their activity it wants —
    // defaulting by role would leak provider-fulfilled orders into a screen that's
    // meant to show only "orders I booked myself", and vice versa.
    const perspective = query.perspective ?? (request.userRole === 'PROVIDER' ? 'provider' : 'customer')

    if (perspective === 'provider') {
      const orders = await orderService.listOrdersForProvider(request.userId, query.status as never).catch(() => [])
      return reply.send({ orders })
    }

    const orders = await orderService.listOrdersForUser(request.userId, query.status as never)
    return reply.send({ orders })
  })

  // GET /orders/:id
  app.get('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const order = await orderService.getOrderById(id, request.userId)
      return reply.send({ order })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(msg === 'FORBIDDEN' ? 403 : 404).send({ error: msg })
    }
  })

  // POST /orders/:id/pay — create Stripe PaymentIntent, returns clientSecret for mobile
  app.post('/:id/pay', { preHandler: requireVerified }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const result = await createPaymentIntentForOrder(id, request.userId)
      return reply.send(result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // POST /orders/:id/pay/confirm — called by mobile after PaymentSheet success
  app.post('/:id/pay/confirm', { preHandler: requireVerified }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ paymentIntentId: z.string() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    try {
      const order = await confirmOrderPayment(id, body.data.paymentIntentId)

      // Notify provider payment confirmed
      const fullOrder = await prisma.order.findUnique({
        where: { id },
        include: { offer: { include: { provider: true } } },
      })
      if (fullOrder?.offer?.provider?.userId) {
        notifyEvent({
          userId: fullOrder.offer.provider.userId,
          pushType: 'PAYMENT_CAPTURED',
          orderId: id,
          title: 'Zahlung gesichert',
          body: 'Die Zahlung wurde im Treuhandkonto hinterlegt. Du kannst mit der Arbeit beginnen.',
        }).catch(() => {})
      }

      return reply.send({ order })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // POST /orders/:id/pay/simulate — dev-only: mark order paid without Stripe
  app.post('/:id/pay/simulate', { preHandler: requireAuth }, async (request, reply) => {
    if (process.env.NODE_ENV === 'production') {
      return reply.status(403).send({ error: 'NOT_AVAILABLE_IN_PRODUCTION' })
    }
    const { id } = request.params as { id: string }
    try {
      const order = await prisma.order.findUnique({
        where: { id },
      })
      if (!order) return reply.status(404).send({ error: 'ORDER_NOT_FOUND' })
      if (order.status !== 'AWAITING_PAYMENT') return reply.status(400).send({ error: `WRONG_STATUS: ${order.status}` })

      const releaseDeadline = new Date()
      releaseDeadline.setHours(releaseDeadline.getHours() + (order.releaseWindowHours ?? 72))

      const updated = await prisma.$transaction(async (tx) => {
        const o = await tx.order.update({
          where: { id },
          data: { status: 'IN_PROGRESS', paymentStatus: 'CAPTURED', releaseDeadline, mangopayEscrowWalletId: 'simulated' },
        })
        await tx.serviceRequest.update({ where: { id: order.requestId }, data: { status: 'IN_PROGRESS' } })
        await tx.orderStatusHistory.create({ data: { orderId: id, status: 'IN_PROGRESS', triggeredBy: 'web_simulation' } })
        return o
      })
      return reply.send({ order: updated })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // POST /orders/:id/complete — provider marks done
  app.post('/:id/complete', { preHandler: requireVerified }, async (request, reply) => {
    if (request.userRole !== 'PROVIDER') return reply.status(403).send({ error: 'PROVIDERS_ONLY' })

    const { id } = request.params as { id: string }
    const body = markCompleteSchema.safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    try {
      const order = await orderService.markComplete(id, request.userId, body.data.photoUrls, body.data.note)

      // Notify customer the job is done and awaiting release
      notifyEvent({
        userId: order.customerId,
        pushType: 'ORDER_UPDATE',
        orderId: id,
        title: 'Auftrag abgeschlossen',
        body: 'Der Anbieter hat die Arbeit als erledigt markiert. Bitte prüfe und gib die Zahlung frei.',
      }).catch(() => {})

      return reply.send({ order })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // POST /orders/:id/release — customer releases payment
  app.post('/:id/release', { preHandler: requireVerified }, async (request, reply) => {
    if (request.userRole === 'ADMIN') return reply.status(403).send({ error: 'ADMINS_CANNOT_RELEASE_PAYMENT' })

    const { id } = request.params as { id: string }
    try {
      // Stripe: capture + transfer to provider
      const { transferId } = await releaseOrderPayment(id)
      // DB: mark order released
      const order = await orderService.releasePayment(id, request.userId, transferId)

      const fullOrder = await prisma.order.findUnique({
        where: { id },
        include: { offer: { include: { provider: true } } },
      })
      if (fullOrder?.offer?.provider?.userId) {
        notifyEvent({
          userId: fullOrder.offer.provider.userId,
          pushType: 'ORDER_UPDATE',
          orderId: id,
          title: 'Zahlung freigegeben',
          body: 'Der Kunde hat die Zahlung freigegeben. Das Geld wird ausgezahlt.',
        }).catch(() => {})
      }

      // Invoices are generated as part of releasePayment — notify both parties
      const invoices = await prisma.invoice.findMany({ where: { orderId: id } })
      for (const invoice of invoices) {
        if (invoice.receiverId === 'platform') continue
        notifyEvent({
          userId: invoice.receiverId,
          pushType: 'INVOICE_ISSUED',
          orderId: id,
          title: 'Neue Rechnung verfügbar',
          body: `Rechnung ${invoice.invoiceNumber} steht in deinem Rechnungsarchiv bereit.`,
        }).catch(() => {})
      }

      return reply.send({ order })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // DELETE /orders/:id — cancel order
  app.delete('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const isAdmin = request.userRole === 'ADMIN'
    try {
      await orderService.cancelOrder(id, request.userId, isAdmin)
      return reply.send({ message: 'Order cancelled' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // ── Chat ──────────────────────────────────────────────────────────────────

  // GET /orders/:id/chat
  app.get('/:id/chat', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const query = z.object({ limit: z.coerce.number().max(100).default(50), before: z.string().optional() }).parse(request.query)
    try {
      const messages = await chatService.getMessages(id, request.userId, query.limit, query.before)
      return reply.send({ messages })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(msg === 'FORBIDDEN' ? 403 : 400).send({ error: msg })
    }
  })

  // POST /orders/:id/chat
  app.post('/:id/chat', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z
      .object({
        content: z.string().min(1).max(4000),
        attachments: z
          .array(
            z.object({
              fileUrl: z.string().url(),
              fileName: z.string(),
              fileType: z.string(),
              fileSizeBytes: z.number().int().max(10 * 1024 * 1024),
            })
          )
          .max(5)
          .optional(),
      })
      .safeParse(request.body)

    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    try {
      const message = await chatService.sendMessage(id, request.userId, body.data.content, body.data.attachments)
      return reply.status(201).send({ message })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      const status = msg === 'FORBIDDEN' ? 403 : msg === 'RATE_LIMITED' ? 429 : 400
      return reply.status(status).send({ error: msg })
    }
  })

  // ── Disputes ──────────────────────────────────────────────────────────────

  // POST /orders/:id/dispute
  app.post('/:id/dispute', { preHandler: requireVerified }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = openDisputeSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    try {
      const dispute = await disputeService.openDispute({
        orderId: id,
        openedByUserId: request.userId,
        ...body.data,
      })
      return reply.status(201).send({ dispute })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // GET /orders/:id/dispute
  app.get('/:id/dispute', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const order = await (await import('../config/prisma.js')).prisma.order.findUnique({ where: { id }, select: { dispute: { select: { id: true } } } })
    if (!order?.dispute) return reply.status(404).send({ error: 'NO_DISPUTE' })

    try {
      const dispute = await disputeService.getDisputeById(order.dispute.id, request.userId)
      return reply.send({ dispute })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(msg === 'FORBIDDEN' ? 403 : 404).send({ error: msg })
    }
  })

  // POST /orders/:id/dispute/respond — the party who didn't open it states their side
  app.post('/:id/dispute/respond', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = respondDisputeSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    const order = await prisma.order.findUnique({ where: { id }, select: { dispute: { select: { id: true } } } })
    if (!order?.dispute) return reply.status(404).send({ error: 'NO_DISPUTE' })

    try {
      const dispute = await disputeService.respondToDispute({
        disputeId: order.dispute.id,
        respondingUserId: request.userId,
        ...body.data,
      })
      return reply.send({ dispute })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      const status = msg === 'FORBIDDEN' ? 403 : msg === 'NOT_FOUND' || msg === 'DISPUTE_NOT_FOUND' ? 404 : 400
      return reply.status(status).send({ error: msg })
    }
  })

  // POST /orders/:id/dispute/evidence — either side attaches a photo/document
  app.post('/:id/dispute/evidence', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = addEvidenceSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    const order = await prisma.order.findUnique({
      where: { id },
      include: { offer: { include: { provider: true } }, dispute: true },
    })
    if (!order?.dispute) return reply.status(404).send({ error: 'NO_DISPUTE' })

    const isCustomer = order.customerId === request.userId
    const isProvider = order.offer.provider.userId === request.userId
    if (!isCustomer && !isProvider) return reply.status(403).send({ error: 'FORBIDDEN' })

    try {
      await disputeService.addEvidence({
        disputeId: order.dispute.id,
        uploadedByUserId: request.userId,
        side: isCustomer ? 'customer' : 'provider',
        files: [body.data],
      })
      const dispute = await disputeService.getDisputeById(order.dispute.id, request.userId)
      return reply.status(201).send({ dispute })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // POST /orders/:id/dispute/resolve — admin only
  app.post('/:id/dispute/resolve', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = resolveDisputeSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    const order = await (await import('../config/prisma.js')).prisma.order.findUnique({ where: { id }, select: { dispute: { select: { id: true } } } })
    if (!order?.dispute) return reply.status(404).send({ error: 'NO_DISPUTE' })

    try {
      const dispute = await disputeService.resolveDispute({
        disputeId: order.dispute.id,
        resolvedByUserId: request.userId,
        ...body.data,
      })
      return reply.send({ dispute })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // POST /orders/:id/rate — customer rates provider, or provider rates customer
  app.post('/:id/rate', { preHandler: requireVerified }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = submitRatingSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    const order = await prisma.order.findUnique({
      where: { id },
      include: { offer: { include: { provider: true } } },
    })
    if (!order) return reply.status(404).send({ error: 'ORDER_NOT_FOUND' })

    const isCustomer = order.customerId === request.userId
    const isProvider = order.offer.provider.userId === request.userId
    if (!isCustomer && !isProvider) return reply.status(403).send({ error: 'FORBIDDEN' })

    try {
      let rating
      if (isCustomer) {
        const customerProfile = await prisma.customerProfile.findUnique({ where: { userId: request.userId } })
        if (!customerProfile) return reply.status(400).send({ error: 'NO_CUSTOMER_PROFILE' })

        const existing = await prisma.rating.findFirst({
          where: { orderId: id, customerRaterId: customerProfile.id },
        })
        if (existing) return reply.status(409).send({ error: 'ALREADY_RATED' })

        rating = await prisma.rating.create({
          data: {
            orderId: id,
            customerRaterId: customerProfile.id,
            providerReceiverId: order.offer.providerId,
            score: body.data.rating,
            comment: body.data.comment,
          },
        })
        flagUnusualRatingPattern({
          raterUserId: request.userId,
          side: 'customer',
          raterProfileId: customerProfile.id,
          receiverProfileId: order.offer.providerId,
        }).catch(() => {})
      } else {
        const providerProfile = await prisma.providerProfile.findUnique({ where: { userId: request.userId } })
        if (!providerProfile) return reply.status(400).send({ error: 'NO_PROVIDER_PROFILE' })

        const customerProfile = await prisma.customerProfile.findUnique({ where: { userId: order.customerId } })
        if (!customerProfile) return reply.status(400).send({ error: 'CUSTOMER_HAS_NO_PROFILE' })

        const existing = await prisma.rating.findFirst({
          where: { orderId: id, providerRaterId: providerProfile.id },
        })
        if (existing) return reply.status(409).send({ error: 'ALREADY_RATED' })

        rating = await prisma.rating.create({
          data: {
            orderId: id,
            providerRaterId: providerProfile.id,
            customerReceiverId: customerProfile.id,
            score: body.data.rating,
            comment: body.data.comment,
          },
        })
        flagUnusualRatingPattern({
          raterUserId: request.userId,
          side: 'provider',
          raterProfileId: providerProfile.id,
          receiverProfileId: customerProfile.id,
        }).catch(() => {})
      }
      return reply.send({ rating })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // GET /orders/:id/rating — the current user's own rating for this order, if any.
  // Lets the app show "bewertet ✓" (and what was submitted) instead of a raw
  // ALREADY_RATED error the second time someone opens the rating button.
  app.get('/:id/rating', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const order = await prisma.order.findUnique({
      where: { id },
      include: { offer: { include: { provider: true } } },
    })
    if (!order) return reply.status(404).send({ error: 'ORDER_NOT_FOUND' })

    const isCustomer = order.customerId === request.userId
    const isProvider = order.offer.provider.userId === request.userId
    if (!isCustomer && !isProvider) return reply.status(403).send({ error: 'FORBIDDEN' })

    let rating = null
    if (isCustomer) {
      const customerProfile = await prisma.customerProfile.findUnique({ where: { userId: request.userId } })
      if (customerProfile) {
        rating = await prisma.rating.findFirst({ where: { orderId: id, customerRaterId: customerProfile.id } })
      }
    } else {
      const providerProfile = await prisma.providerProfile.findUnique({ where: { userId: request.userId } })
      if (providerProfile) {
        rating = await prisma.rating.findFirst({ where: { orderId: id, providerRaterId: providerProfile.id } })
      }
    }
    return reply.send({ rating })
  })
}
