import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth, requireVerified } from '../middleware/auth.middleware.js'
import * as negotiation from '../services/negotiation.service.js'
import * as orderService from '../services/order.service.js'
import { notifyEvent } from '../services/notification.service.js'
import { prisma } from '../config/prisma.js'

const proposeSchema = z.object({
  requestId: z.string().uuid(),
  providerId: z.string().uuid(),
  proposedPrice: z.number().positive(),
  scopeOfWork: z.string().min(5).max(2000),
  estimatedDurationDays: z.number().int().min(1).max(365).optional(),
  proposedDate: z.coerce.date().optional(),
  validHours: z.number().int().min(1).max(720).optional(),
  parentOfferId: z.string().uuid().optional(),
})

function statusForError(message: string): number {
  if (message === 'FORBIDDEN' || message.startsWith('CANNOT_')) return 403
  if (message.endsWith('NOT_FOUND')) return 404
  return 400
}

export async function negotiationRoutes(app: FastifyInstance) {
  // GET /negotiations/:requestId/:providerId — full transcript + active offer
  app.get('/:requestId/:providerId', { preHandler: requireAuth }, async (request, reply) => {
    const params = z
      .object({ requestId: z.string().uuid(), providerId: z.string().uuid() })
      .safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    try {
      const result = await negotiation.getNegotiation(
        params.data.requestId,
        params.data.providerId,
        request.userId,
      )
      return reply.send(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ERROR'
      return reply.status(statusForError(message)).send({ error: message })
    }
  })

  // POST /negotiations/offers — propose an offer or a counter-offer
  app.post('/offers', { preHandler: requireVerified }, async (request, reply) => {
    const body = proposeSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }

    try {
      const result = await negotiation.proposeOffer({
        ...body.data,
        proposedByUserId: request.userId,
      })
      return reply.status(201).send(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ERROR'
      return reply.status(statusForError(message)).send({ error: message })
    }
  })

  // POST /negotiations/offers/:offerId/decline
  app.post('/offers/:offerId/decline', { preHandler: requireAuth }, async (request, reply) => {
    const { offerId } = request.params as { offerId: string }
    try {
      return reply.send(await negotiation.declineOffer(offerId, request.userId))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ERROR'
      return reply.status(statusForError(message)).send({ error: message })
    }
  })

  // POST /negotiations/offers/:offerId/withdraw
  app.post('/offers/:offerId/withdraw', { preHandler: requireAuth }, async (request, reply) => {
    const { offerId } = request.params as { offerId: string }
    try {
      return reply.send(await negotiation.withdrawOwnOffer(offerId, request.userId))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ERROR'
      return reply.status(statusForError(message)).send({ error: message })
    }
  })

  // POST /negotiations/offers/:offerId/accept
  // Only the customer can accept — accepting is what creates the escrow order,
  // so it reuses the existing acceptOffer flow rather than duplicating the
  // commission/VAT/release-window logic.
  app.post('/offers/:offerId/accept', { preHandler: requireVerified }, async (request, reply) => {
    const { offerId } = request.params as { offerId: string }

    try {
      const offer = await prisma.offer.findUnique({
        where: { id: offerId },
        include: { request: { include: { customer: true } }, provider: true },
      })
      if (!offer) return reply.status(404).send({ error: 'OFFER_NOT_FOUND' })

      // A customer can't accept their own price suggestion — only a real
      // provider offer becomes an order.
      if (offer.proposedByUserId === request.userId) {
        return reply.status(403).send({ error: 'CANNOT_ACCEPT_OWN_OFFER' })
      }

      const order = await orderService.acceptOffer(offerId, request.userId)

      const chat = await prisma.chat.findUnique({
        where: { requestId_providerId: { requestId: offer.requestId, providerId: offer.providerId } },
      })
      if (chat) {
        await prisma.chatMessage.create({
          data: {
            chatId: chat.id,
            senderId: request.userId,
            messageType: 'SYSTEM',
            isSystem: true,
            content: `Angebot angenommen — Auftrag über ${offer.proposedPrice.toFixed(2)} € erstellt.`,
          },
        })
      }

      notifyEvent({
        userId: offer.provider.userId,
        pushType: 'OFFER_ACCEPTED',
        orderId: order.id,
        requestId: offer.requestId,
        title: 'Angebot angenommen',
        body: `Dein Angebot über ${offer.proposedPrice.toFixed(2)} € wurde angenommen.`,
      }).catch(() => {})

      return reply.send({ order })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ERROR'
      return reply.status(statusForError(message)).send({ error: message })
    }
  })
}
