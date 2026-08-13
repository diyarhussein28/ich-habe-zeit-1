import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { requireAuth, requireVerified } from '../middleware/auth.middleware.js'
import * as orderService from '../services/order.service.js'
import { haversineKm } from '../lib/geo.js'

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
        q: z.string().min(1).max(100).optional(), // full-text search on title/description
        priceMin: z.coerce.number().nonnegative().optional(),
        priceMax: z.coerce.number().positive().optional(),
        pricingModel: z.enum(['FIXED_PRICE', 'PER_HOUR']).optional(),
        minRating: z.coerce.number().min(0).max(5).optional(),
        verifiedOnly: z.coerce.boolean().optional(),
        availableOnly: z.coerce.boolean().optional(),
        lat: z.coerce.number().optional(),
        lon: z.coerce.number().optional(),
        radiusKm: z.coerce.number().positive().max(200).optional(),
        sort: z.enum(['newest', 'price_asc', 'price_desc', 'rating', 'distance']).default('newest'),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query)

    const where: Record<string, unknown> = { status: 'ACTIVE' }
    if (query.categoryId) where.categoryId = query.categoryId
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' }
    if (query.plz && !(query.lat && query.lon && query.radiusKm)) {
      where.plz = { startsWith: query.plz.slice(0, 3) }
    }
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    if (query.priceMin || query.priceMax) {
      where.price = {
        ...(query.priceMin !== undefined && { gte: query.priceMin }),
        ...(query.priceMax !== undefined && { lte: query.priceMax }),
      }
    }
    if (query.pricingModel) where.pricingModel = query.pricingModel
    if (query.minRating !== undefined) {
      where.provider = { ...(where.provider as object), averageRating: { gte: query.minRating } }
    }
    if (query.verifiedOnly) {
      where.provider = {
        ...(where.provider as object),
        user: { verificationStatus: 'KYC_VERIFIED' },
      }
    }
    if (query.availableOnly) {
      where.provider = { ...(where.provider as object), isAvailable: true }
    }

    const orderBy: Record<string, unknown> =
      query.sort === 'price_asc'
        ? { price: 'asc' }
        : query.sort === 'price_desc'
          ? { price: 'desc' }
          : query.sort === 'rating'
            ? { provider: { averageRating: 'desc' } }
            : { createdAt: 'desc' } // 'newest' and 'distance' (distance sorted post-query below)

    const useRadius = query.lat !== undefined && query.lon !== undefined && query.radiusKm !== undefined

    // With a real radius search we can't paginate in SQL until distances are computed,
    // so pull a bounded working set, filter/sort in-memory, then paginate.
    const [rawItems, totalWithoutRadius] = await Promise.all([
      prisma.serviceListing.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, icon: true } },
          provider: {
            include: {
              user: { select: { id: true, displayName: true, profilePhotoUrl: true, verificationStatus: true } },
            },
          },
        },
        orderBy: orderBy as never,
        take: useRadius ? 500 : query.limit,
        skip: useRadius ? 0 : query.offset,
      }),
      prisma.serviceListing.count({ where }),
    ])

    if (!useRadius) {
      return reply.send({ items: rawItems, total: totalWithoutRadius, limit: query.limit, offset: query.offset })
    }

    const withDistance = rawItems
      .map((item) => ({
        item,
        distanceKm:
          item.lat != null && item.lon != null
            ? haversineKm(query.lat!, query.lon!, item.lat, item.lon)
            : null,
      }))
      // Fall back to keeping items without coordinates only if PLZ prefix matches (best-effort)
      .filter((x) => x.distanceKm !== null ? x.distanceKm <= query.radiusKm! : (query.plz ? x.item.plz.startsWith(query.plz.slice(0, 2)) : false))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))

    const page = withDistance.slice(query.offset, query.offset + query.limit)

    return reply.send({
      items: page.map((x) => ({ ...x.item, distanceKm: x.distanceKm })),
      total: withDistance.length,
      limit: query.limit,
      offset: query.offset,
    })
  })

  // GET /listings/:id — listing detail (public, bumps view count)
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const listing = await prisma.serviceListing.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        provider: {
          include: {
            user: { select: { id: true, displayName: true, profilePhotoUrl: true } },
            serviceAreas: true,
            ratings: { select: { score: true }, take: 10, orderBy: { createdAt: 'desc' } },
          },
        },
        packages: { orderBy: { price: 'asc' } },
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
        category: { select: { id: true, name: true, icon: true } },
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
      include: { category: { select: { id: true, name: true, icon: true } } },
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

  // ─── Packages ───────────────────────────────────────────────────────────
  // Tiered packages let a Dienstleister publish what they offer at a glance
  // (Basic / Standard / Premium) instead of a single opaque price. Optional:
  // a listing with no packages keeps using its flat `price`.

  const packageSchema = z.object({
    tier: z.enum(['BASIC', 'STANDARD', 'PREMIUM']),
    title: z.string().min(2).max(80),
    description: z.string().min(5).max(1000),
    price: z.number().positive(),
    deliveryDays: z.number().int().min(1).max(365),
    features: z.array(z.string().min(1).max(120)).max(10).default([]),
  })

  /**
   * Returns null when the listing exists and belongs to the caller, otherwise
   * the failure the route should reply with.
   */
  async function checkOwnListing(
    listingId: string,
    userId: string,
  ): Promise<{ error: string; status: number } | null> {
    const listing = await prisma.serviceListing.findUnique({
      where: { id: listingId },
      include: { provider: true },
    })
    if (!listing) return { error: 'LISTING_NOT_FOUND', status: 404 }
    if (listing.provider.userId !== userId) return { error: 'FORBIDDEN', status: 403 }
    return null
  }

  // GET /listings/:id/packages — public
  app.get('/:id/packages', async (request, reply) => {
    const { id } = request.params as { id: string }
    const packages = await prisma.listingPackage.findMany({
      where: { listingId: id },
      orderBy: { price: 'asc' },
    })
    return reply.send({ packages })
  })

  // PUT /listings/:id/packages/:tier — create or replace one tier
  app.put('/:id/packages/:tier', { preHandler: requireVerified }, async (request, reply) => {
    const { id, tier } = request.params as { id: string; tier: string }
    const body = packageSchema.safeParse({ ...(request.body as object), tier })
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }

    const denied = await checkOwnListing(id, request.userId)
    if (denied) return reply.status(denied.status).send({ error: denied.error })

    const data = body.data
    const pkg = await prisma.listingPackage.upsert({
      where: { listingId_tier: { listingId: id, tier: data.tier } },
      create: { listingId: id, ...data },
      update: {
        title: data.title,
        description: data.description,
        price: data.price,
        deliveryDays: data.deliveryDays,
        features: data.features,
      },
    })
    return reply.send({ package: pkg })
  })

  // DELETE /listings/:id/packages/:tier
  app.delete('/:id/packages/:tier', { preHandler: requireAuth }, async (request, reply) => {
    const { id, tier } = request.params as { id: string; tier: string }
    const parsedTier = z.enum(['BASIC', 'STANDARD', 'PREMIUM']).safeParse(tier)
    if (!parsedTier.success) return reply.status(400).send({ error: 'INVALID_TIER' })

    const denied = await checkOwnListing(id, request.userId)
    if (denied) return reply.status(denied.status).send({ error: denied.error })

    await prisma.listingPackage.deleteMany({ where: { listingId: id, tier: parsedTier.data } })
    return reply.send({ deleted: true })
  })
}
