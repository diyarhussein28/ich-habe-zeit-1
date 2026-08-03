import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { requireAuth, requireVerified } from '../middleware/auth.middleware.js'
import * as orderService from '../services/order.service.js'

const createListingSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().min(3).max(100),
  description: z.string().min(20).max(2000),
  price: z.number().positive(),
  pricingModel: z.enum(['FIXED_PRICE', 'PER_HOUR']).default('FIXED_PRICE'),
  city: z.string().min(2),
  plz: z.string().regex(/^\d{5}$/),
  photoUrls: z.array(z.string().url()).max(6).optional(),
})

const updateListingSchema = createListingSchema.partial().extend({
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
})

export async function listingRoutes(app: FastifyInstance) {
  // GET /listings — browse active listings (public)
  app.get('/', async (request, reply) => {
    const query = z
      .object({
        categoryId: z.string().uuid().optional(),
        city: z.string().optional(),
        plz: z.string().optional(),
        priceMax: z.coerce.number().positive().optional(),
        pricingModel: z.enum(['FIXED_PRICE', 'PER_HOUR']).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query)

    const where: Record<string, unknown> = { status: 'ACTIVE' }
    if (query.categoryId) where.categoryId = query.categoryId
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' }
    if (query.plz) where.plz = { startsWith: query.plz.slice(0, 3) }
    if (query.priceMax) where.price = { lte: query.priceMax }
    if (query.pricingModel) where.pricingModel = query.pricingModel

    const [items, total] = await Promise.all([
      prisma.serviceListing.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, iconUrl: true } },
          provider: {
            include: {
              user: { select: { id: true, displayName: true, profilePhotoUrl: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.serviceListing.count({ where }),
    ])

    return reply.send({ items, total, limit: query.limit, offset: query.offset })
  })

  // GET /listings/:id — listing detail (public, bumps view count)
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const listing = await prisma.serviceListing.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, iconUrl: true } },
        provider: {
          include: {
            user: { select: { id: true, displayName: true, profilePhotoUrl: true } },
            serviceAreas: true,
            ratings: { select: { score: true }, take: 10, orderBy: { createdAt: 'desc' } },
          },
        },
      },
    })

    if (!listing) return reply.status(404).send({ error: 'LISTING_NOT_FOUND' })
    if (listing.status === 'ARCHIVED') return reply.status(404).send({ error: 'LISTING_NOT_FOUND' })

    // Bump view count (fire-and-forget)
    prisma.serviceListing.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {})

    return reply.send({ listing })
  })

  // POST /listings — provider creates a listing
  app.post('/', { preHandler: requireVerified }, async (request, reply) => {
    if (request.userRole !== 'PROVIDER') {
      return reply.status(403).send({ error: 'PROVIDERS_ONLY' })
    }

    const body = createListingSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    const provider = await prisma.providerProfile.findUnique({ where: { userId: request.userId } })
    if (!provider) return reply.status(404).send({ error: 'PROVIDER_PROFILE_NOT_FOUND' })

    const listing = await prisma.serviceListing.create({
      data: {
        providerId: provider.id,
        categoryId: body.data.categoryId,
        title: body.data.title,
        description: body.data.description,
        price: body.data.price,
        pricingModel: body.data.pricingModel,
        city: body.data.city,
        plz: body.data.plz,
        photoUrls: body.data.photoUrls ?? [],
      },
      include: {
        category: { select: { id: true, name: true, iconUrl: true } },
      },
    })

    return reply.status(201).send({ listing })
  })

  // PATCH /listings/:id — provider updates their listing
  app.patch('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const provider = await prisma.providerProfile.findUnique({ where: { userId: request.userId } })
    const listing = await prisma.serviceListing.findUnique({ where: { id } })

    if (!listing) return reply.status(404).send({ error: 'LISTING_NOT_FOUND' })
    if (!provider || listing.providerId !== provider.id) {
      return reply.status(403).send({ error: 'FORBIDDEN' })
    }

    const body = updateListingSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    const updated = await prisma.serviceListing.update({
      where: { id },
      data: body.data,
      include: { category: { select: { id: true, name: true, iconUrl: true } } },
    })

    return reply.send({ listing: updated })
  })

  // POST /listings/:id/book — customer books a listing directly → creates Order
  app.post('/:id/book', { preHandler: requireVerified }, async (request, reply) => {
    if (request.userRole === 'ADMIN') {
      return reply.status(403).send({ error: 'ADMINS_CANNOT_BOOK' })
    }

    const { id } = request.params as { id: string }
    const body = z
      .object({ preferredDate: z.coerce.date().optional() })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    const listing = await prisma.serviceListing.findUnique({
      where: { id },
      include: { provider: true },
    })
    if (!listing) return reply.status(404).send({ error: 'LISTING_NOT_FOUND' })
    if (listing.status !== 'ACTIVE') return reply.status(400).send({ error: 'LISTING_NOT_ACTIVE' })

    // Provider cannot book their own listing
    if (listing.provider.userId === request.userId) {
      return reply.status(403).send({ error: 'CANNOT_BOOK_OWN_LISTING' })
    }

    // Upsert CustomerProfile for the booker (supports dual-role providers)
    const customerProfile = await prisma.customerProfile.upsert({
      where: { userId: request.userId },
      create: { userId: request.userId },
      update: {},
    })

    const preferredDateStart = body.data.preferredDate ?? new Date(Date.now() + 24 * 60 * 60 * 1000)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const order = await prisma.$transaction(async (tx) => {
      // Auto-create ServiceRequest from listing
      const serviceRequest = await tx.serviceRequest.create({
        data: {
          customerId: customerProfile.id,
          categoryId: listing.categoryId,
          title: listing.title,
          description: listing.description,
          plz: listing.plz,
          addressCity: listing.city,
          preferredDateStart,
          expiresAt,
          status: 'OFFER_RECEIVED',
          budgetMin: listing.price,
          budgetMax: listing.price,
          budgetType: 'exact',
        },
      })

      // Auto-create Offer from listing
      const offer = await tx.offer.create({
        data: {
          requestId: serviceRequest.id,
          providerId: listing.providerId,
          proposedPrice: listing.price,
          scopeOfWork: listing.description,
          personalMessage: `Direktbuchung über Inserat: ${listing.title}`,
          proposedDate: preferredDateStart,
          status: 'ACCEPTED',
          validUntil,
        },
      })

      // Update request status
      await tx.serviceRequest.update({
        where: { id: serviceRequest.id },
        data: { status: 'AWAITING_PAYMENT' },
      })

      // Create order
      const { getEffectiveCommissionRate } = await import('../services/category.service.js')
      const { env } = await import('../config/env.js')
      const commissionRate = await getEffectiveCommissionRate(listing.categoryId, listing.city)
      const grossAmount = listing.price
      const commissionAmount = Math.max(grossAmount * commissionRate, 1.0)
      const vatOnCommission = commissionAmount * 0.19
      const netProviderAmount = grossAmount - commissionAmount

      const releaseDeadline = new Date()
      releaseDeadline.setHours(releaseDeadline.getHours() + env.DEFAULT_RELEASE_WINDOW_HOURS)

      const newOrder = await tx.order.create({
        data: {
          requestId: serviceRequest.id,
          offerId: offer.id,
          customerId: request.userId,
          status: 'AWAITING_PAYMENT',
          grossAmount,
          commissionRate,
          commissionAmount,
          vatOnCommission,
          netProviderAmount,
          releaseWindowHours: env.DEFAULT_RELEASE_WINDOW_HOURS,
        },
      })

      await tx.chat.create({ data: { orderId: newOrder.id } })
      await tx.orderStatusHistory.create({
        data: { orderId: newOrder.id, status: 'AWAITING_PAYMENT', triggeredBy: request.userId },
      })

      // Reject all other pending offers (none here, but for consistency)
      await tx.offer.updateMany({
        where: { requestId: serviceRequest.id, id: { not: offer.id }, status: 'PENDING' },
        data: { status: 'REJECTED' },
      })

      return newOrder
    })

    return reply.status(201).send({ order })
  })
}
