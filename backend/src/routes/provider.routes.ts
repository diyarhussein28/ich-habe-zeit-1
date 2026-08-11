import type { FastifyInstance } from 'fastify'
import { prisma } from '../config/prisma.js'

export async function providerRoutes(app: FastifyInstance) {
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
