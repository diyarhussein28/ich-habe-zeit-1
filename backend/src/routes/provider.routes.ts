import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma.js'

export async function providerRoutes(app: FastifyInstance) {
  // GET /providers — searchable provider directory.
  //
  // Listings answer "who sells this exact service"; this answers "who can do
  // this kind of work near me", which is how people actually start looking.
  // Public, like the individual profile view.
  app.get('/', async (request, reply) => {
    // safeParse, not parse: a caller sending e.g. minRating=99 should get a 400
    // describing the problem, not an unhandled throw surfacing as a 500.
    const parsed = z
      .object({
        q: z.string().min(1).max(100).optional(),
        categoryId: z.string().uuid().optional(),
        plz: z.string().regex(/^\d{1,5}$/).optional(),
        language: z.string().min(2).max(40).optional(),
        minRating: z.coerce.number().min(0).max(5).optional(),
        verifiedOnly: z.coerce.boolean().optional(),
        availableOnly: z.coerce.boolean().optional(),
        sort: z.enum(['rating', 'reviews', 'newest']).default('rating'),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .safeParse(request.query)

    if (!parsed.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    }
    const query = parsed.data

    const where: Prisma.ProviderProfileWhereInput = {}

    if (query.q) {
      where.OR = [
        { user: { displayName: { contains: query.q, mode: 'insensitive' } } },
        { bio: { contains: query.q, mode: 'insensitive' } },
        { listings: { some: { status: 'ACTIVE', title: { contains: query.q, mode: 'insensitive' } } } },
      ]
    }
    if (query.categoryId) {
      where.providerCategories = { some: { categoryId: query.categoryId } }
    }
    if (query.language) {
      where.languages = { has: query.language }
    }
    if (query.minRating !== undefined) {
      where.averageRating = { gte: query.minRating }
    }
    if (query.availableOnly) where.isAvailable = true
    if (query.verifiedOnly) {
      where.user = { ...(where.user as object), verificationStatus: 'KYC_VERIFIED' }
    }
    // Match on PLZ prefix so "50" finds all of the Cologne area, mirroring how
    // the request feed matches providers to jobs.
    if (query.plz) {
      where.serviceAreas = {
        some: {
          OR: [
            { homePlz: { startsWith: query.plz.slice(0, 2) } },
            { plzList: { has: query.plz } },
          ],
        },
      }
    }

    const orderBy: Prisma.ProviderProfileOrderByWithRelationInput =
      query.sort === 'reviews'
        ? { totalReviews: 'desc' }
        : query.sort === 'newest'
          ? { createdAt: 'desc' }
          : { averageRating: 'desc' }

    const [total, rows] = await Promise.all([
      prisma.providerProfile.count({ where }),
      prisma.providerProfile.findMany({
        where,
        include: {
          user: { select: { id: true, displayName: true, profilePhotoUrl: true, verificationStatus: true } },
          providerCategories: { include: { category: { select: { id: true, name: true, icon: true } } } },
          serviceAreas: { select: { homePlz: true, radiusKm: true } },
          _count: { select: { listings: true } },
        },
        orderBy,
        take: query.limit,
        skip: query.offset,
      }),
    ])

    return reply.send({
      total,
      limit: query.limit,
      offset: query.offset,
      items: rows.map((p) => ({
        id: p.id,
        displayName: p.user.displayName,
        profilePhotoUrl: p.user.profilePhotoUrl,
        isVerified: p.user.verificationStatus === 'KYC_VERIFIED',
        bio: p.bio,
        languages: p.languages,
        isAvailable: p.isAvailable,
        averageRating: p.averageRating,
        totalReviews: p.totalReviews,
        listingCount: p._count.listings,
        categories: p.providerCategories.map((pc) => ({
          id: pc.category.id,
          name: pc.category.name,
          icon: pc.category.icon,
          isVerified: pc.isVerified,
        })),
        serviceAreas: p.serviceAreas,
      })),
    })
  })

  // GET /providers/:id — public Dienstleister profile (bio, languages, expertise,
  // portfolio, listings, reviews). Public like listing detail — no auth required,
  // this is the browsable marketplace-facing view of a provider.
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const provider = await prisma.providerProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, displayName: true, profilePhotoUrl: true, createdAt: true } },
        serviceAreas: true,
        providerCategories: {
          include: { category: { select: { id: true, name: true, icon: true } } },
        },
        listings: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        ratings: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { customerRater: { include: { user: { select: { displayName: true } } } } },
        },
      },
    })

    if (!provider) return reply.status(404).send({ error: 'PROVIDER_NOT_FOUND' })

    const reviews = provider.ratings.map((r) => ({
      id: r.id,
      score: r.score,
      comment: r.comment,
      createdAt: r.createdAt,
      reviewerName: r.customerRater?.user.displayName ?? 'Anonym',
    }))

    return reply.send({
      provider: {
        id: provider.id,
        displayName: provider.user.displayName,
        profilePhotoUrl: provider.user.profilePhotoUrl,
        memberSince: provider.user.createdAt,
        bio: provider.bio,
        languages: provider.languages,
        servicePhotoUrls: provider.servicePhotoUrls,
        isAvailable: provider.isAvailable,
        averageRating: provider.averageRating,
        totalReviews: provider.totalReviews,
        categories: provider.providerCategories.map((pc) => ({
          id: pc.category.id,
          name: pc.category.name,
          icon: pc.category.icon,
          isVerified: pc.isVerified,
        })),
        serviceAreas: provider.serviceAreas.map((a) => ({ homePlz: a.homePlz, radiusKm: a.radiusKm })),
        listings: provider.listings,
        reviews,
      },
    })
  })
}
