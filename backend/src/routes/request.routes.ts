import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as requestService from '../services/request.service.js'
import * as offerService from '../services/offer.service.js'
import * as chatService from '../services/chat.service.js'
import { requireAuth, requireVerified } from '../middleware/auth.middleware.js'
import { notifyEvent } from '../services/notification.service.js'
import { prisma } from '../config/prisma.js'

const createRequestSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().min(3).max(100),
  description: z.string().min(20).max(2000),
  plz: z.string().regex(/^\d{5}$/),
  city: z.string().optional(),
  addressStreet: z.string().optional(),
  addressCity: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  scheduledAt: z.coerce.date().optional(),
  preferredDateStart: z.coerce.date().optional(),
  preferredDateEnd: z.coerce.date().optional(),
  budget: z.number().positive().optional(),
  budgetMin: z.number().positive().optional(),
  budgetMax: z.number().positive().optional(),
  budgetType: z.enum(['exact', 'range', 'none'] as const).optional(),
  materialsIncluded: z.enum(['yes', 'no', 'to_be_discussed'] as const).optional(),
  urgency: z.enum(['NORMAL', 'URGENT'] as const).optional(),
  broadcastType: z.enum(['OPEN', 'DIRECT'] as const).optional(),
  directProviderId: z.string().uuid().optional(),
  customFieldValues: z.record(z.string(), z.unknown()).optional(),
  photoUrls: z.array(z.string().url()).max(8).optional(),
})

const createOfferSchema = z.object({
  price: z.number().positive().optional(),
  proposedPrice: z.number().positive().optional(),
  message: z.string().min(10).max(2000).optional(),
  scopeOfWork: z.string().min(10).max(2000).optional(),
  validUntil: z.string().optional(),
  validHours: z.number().int().min(1).max(168).optional(),
  proposedDate: z.coerce.date().optional(),
  pricingBreakdown: z.record(z.string(), z.unknown()).optional(),
  estimatedDurationHours: z.number().positive().optional(),
  exclusions: z.string().optional(),
  materialsHandling: z.enum(['included', 'excluded', 'billed_separately'] as const).optional(),
  personalMessage: z.string().max(500).optional(),
}).refine((d) => (d.price ?? d.proposedPrice) != null, { message: 'price is required' })
 .refine((d) => (d.message ?? d.scopeOfWork) != null, { message: 'message is required' })

export async function requestRoutes(app: FastifyInstance) {
  // GET /requests — list open requests (provider feed or customer history)
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const query = z
      .object({
        categoryId: z.string().uuid().optional(),
        status: z.string().optional(),
        plz: z.string().optional(),
        q: z.string().min(1).max(100).optional(),
        sort: z.enum(['newest', 'urgency', 'budget_asc', 'budget_desc']).optional(),
        limit: z.coerce.number().max(50).default(20),
        offset: z.coerce.number().default(0),
        feed: z.coerce.boolean().default(false),
      })
      .parse(request.query)

    if (query.feed && request.userRole === 'PROVIDER') {
      const result = await requestService.listProviderFeed(request.userId, query.limit, query.offset)
      return reply.send(result)
    }

    const result = await requestService.listRequests({
      categoryId: query.categoryId,
      status: query.status as never,
      plz: query.plz,
      q: query.q,
      sort: query.sort,
      customerId: request.userId,
      limit: query.limit,
      offset: query.offset,
    })
    return reply.send(result)
  })

  // POST /requests — create request
  app.post('/', { preHandler: requireVerified }, async (request, reply) => {
    if (request.userRole === 'ADMIN') {
      return reply.status(403).send({ error: 'ADMINS_CANNOT_POST_REQUESTS' })
    }

    const body = createRequestSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    try {
      const req = await requestService.createRequest({
        ...body.data,
        customerId: request.userId,
        addressCity: body.data.addressCity ?? body.data.city,
        budgetMin: body.data.budgetMin ?? body.data.budget,
        preferredDateStart: body.data.preferredDateStart ?? body.data.scheduledAt ?? tomorrow,
      })
      return reply.status(201).send({ request: req })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // GET /requests/:id
  app.get('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const req = await requestService.getRequestById(id)
    if (!req) return reply.status(404).send({ error: 'NOT_FOUND' })
    return reply.send({ request: req })
  })

  // POST /requests/:id/publish
  app.post('/:id/publish', { preHandler: requireVerified }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const req = await requestService.publishRequest(id, request.userId)
      return reply.send({ request: req })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // DELETE /requests/:id — cancel
  app.delete('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await requestService.cancelRequest(id, request.userId)
      return reply.send({ message: 'Cancelled' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // ── Offer withdraw ───────────────────────────────────────────────────────
  // Static "offers" prefix ensures Fastify prefers this over /:id routes.

  // POST /requests/offers/:offerId/withdraw — provider withdraws an offer
  app.post('/offers/:offerId/withdraw', { preHandler: requireAuth }, async (request, reply) => {
    if (request.userRole !== 'PROVIDER') {
      return reply.status(403).send({ error: 'PROVIDERS_ONLY' })
    }
    const { offerId } = request.params as { offerId: string }
    try {
      const offer = await offerService.withdrawOffer(offerId, request.userId)
      return reply.send({ offer })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // POST /requests/offers/:offerId/reject — customer declines an offer
  // Ownership is enforced by offerService (offer's request.customer.userId must
  // match the caller), not by account role — dual-role accounts (role=PROVIDER
  // with a secondary customer profile) must still be able to manage offers on
  // requests they created as a customer.
  app.post('/offers/:offerId/reject', { preHandler: requireAuth }, async (request, reply) => {
    const { offerId } = request.params as { offerId: string }
    try {
      const { offer, providerUserId, requestTitle } = await offerService.rejectOffer(offerId, request.userId)

      notifyEvent({
        userId: providerUserId,
        pushType: 'OFFER_ACCEPTED', // reuse existing offer-status push category
        title: 'Angebot abgelehnt',
        body: `Der Kunde hat dein Angebot für "${requestTitle}" abgelehnt.`,
      }).catch(() => {})

      return reply.send({ offer })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(msg === 'NOT_FOUND' ? 404 : 400).send({ error: msg })
    }
  })

  // POST /requests/offers/:offerId/counter — customer declines but suggests a different price
  // Ownership is enforced by offerService, same reasoning as /reject above.
  app.post('/offers/:offerId/counter', { preHandler: requireAuth }, async (request, reply) => {
    const { offerId } = request.params as { offerId: string }
    const body = z.object({ counterPrice: z.number().positive(), message: z.string().max(500).optional() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    try {
      const result = await offerService.counterOffer(offerId, request.userId, body.data.counterPrice, body.data.message)

      notifyEvent({
        userId: result.providerUserId,
        pushType: 'OFFER_ACCEPTED',
        title: 'Gegenangebot erhalten',
        body: `Der Kunde schlägt ${result.counterPrice.toFixed(2)} € für "${result.requestTitle}" vor.${result.message ? ` „${result.message}"` : ''}`,
        requestId: result.requestId,
      }).catch(() => {})

      return reply.send({ offer: result.offer })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(msg === 'NOT_FOUND' ? 404 : 400).send({ error: msg })
    }
  })

  // ── Provider's own offers ────────────────────────────────────────────────

  // GET /requests/offers/mine — provider sees all their submitted offers
  app.get('/offers/mine', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const offers = await offerService.getProviderOffers(request.userId)
      return reply.send({ offers })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // ── Offers on a request ──────────────────────────────────────────────────

  // GET /requests/:id/offers — customer sees all offers for their request
  app.get('/:id/offers', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const offers = await offerService.getOffersForRequest(id, request.userId)
      return reply.send({ offers })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // POST /requests/:id/offers — provider submits an offer
  app.post('/:id/offers', { preHandler: requireVerified }, async (request, reply) => {
    if (request.userRole !== 'PROVIDER') {
      return reply.status(403).send({ error: 'PROVIDERS_ONLY' })
    }

    const { id } = request.params as { id: string }
    const body = createOfferSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    try {
      const d = body.data
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
      const offer = await offerService.createOffer({
        requestId: id,
        providerUserId: request.userId,
        proposedPrice: d.proposedPrice ?? d.price!,
        scopeOfWork: d.scopeOfWork ?? d.message!,
        proposedDate: d.proposedDate ?? tomorrow,
        validHours: d.validHours ?? (d.validUntil ? Math.round((new Date(d.validUntil).getTime() - Date.now()) / 3600000) : 168),
        pricingBreakdown: d.pricingBreakdown,
        estimatedDurationHours: d.estimatedDurationHours,
        exclusions: d.exclusions,
        materialsHandling: d.materialsHandling,
        personalMessage: d.personalMessage,
      })

      // Notify request owner about the new offer
      const req = await prisma.serviceRequest.findUnique({
        where: { id },
        include: { customer: { include: { user: true } } },
      })
      if (req?.customer?.userId) {
        notifyEvent({
          userId: req.customer.userId,
          pushType: 'NEW_OFFER',
          requestId: id,
          title: 'Neues Angebot erhalten',
          body: `Ein Anbieter hat ein Angebot für "${req.title}" abgegeben.`,
          category: 'newOffer',
        }).catch(() => {})
      }

      return reply.status(201).send({ offer })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // ── Pre-offer inquiry chat ─────────────────────────────────────────────────
  // Lets a provider ask the customer clarifying questions before deciding
  // whether to submit an offer — separate from the order chat, which only
  // exists once an offer has been accepted and paid.

  // POST /requests/:id/chat — provider opens (or resumes) their own thread
  app.post('/:id/chat', { preHandler: requireVerified }, async (request, reply) => {
    if (request.userRole !== 'PROVIDER') return reply.status(403).send({ error: 'PROVIDERS_ONLY' })
    const { id } = request.params as { id: string }

    const providerProfile = await prisma.providerProfile.findUnique({ where: { userId: request.userId } })
    if (!providerProfile) return reply.status(400).send({ error: 'NO_PROVIDER_PROFILE' })

    try {
      const chat = await chatService.getOrCreateRequestChat(id, providerProfile.id, request.userId)
      return reply.send({ chat })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      const status = msg === 'FORBIDDEN' ? 403 : msg === 'REQUEST_NOT_FOUND' ? 404 : 400
      return reply.status(status).send({ error: msg })
    }
  })

  // GET /requests/:id/chats — customer sees every provider inquiry thread on their request
  app.get('/:id/chats', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const req = await prisma.serviceRequest.findUnique({ where: { id }, include: { customer: true } })
    if (!req) return reply.status(404).send({ error: 'NOT_FOUND' })
    if (req.customer.userId !== request.userId) return reply.status(403).send({ error: 'FORBIDDEN' })

    const chats = await prisma.chat.findMany({
      where: { requestId: id },
      include: {
        provider: { include: { user: { select: { id: true, displayName: true, profilePhotoUrl: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send({ chats })
  })

  // GET /requests/:id/chats/:providerId/messages
  app.get('/:id/chats/:providerId/messages', { preHandler: requireAuth }, async (request, reply) => {
    const { id, providerId } = request.params as { id: string; providerId: string }
    try {
      const messages = await chatService.getRequestMessages(id, providerId, request.userId)
      return reply.send({ messages })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      const status = msg === 'FORBIDDEN' ? 403 : msg.includes('NOT_FOUND') ? 404 : 400
      return reply.status(status).send({ error: msg })
    }
  })

  // POST /requests/:id/chats/:providerId/messages
  app.post('/:id/chats/:providerId/messages', { preHandler: requireVerified }, async (request, reply) => {
    const { id, providerId } = request.params as { id: string; providerId: string }
    const body = z.object({ content: z.string().min(1).max(2000) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    try {
      const message = await chatService.sendRequestMessage(id, providerId, request.userId, body.data.content)
      return reply.status(201).send({ message })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      const status = msg === 'FORBIDDEN' ? 403 : msg === 'RATE_LIMITED' ? 429 : msg.includes('NOT_FOUND') ? 404 : 400
      return reply.status(status).send({ error: msg })
    }
  })
}
