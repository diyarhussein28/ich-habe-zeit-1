import type { FastifyInstance } from 'fastify'
import { prisma } from '../config/prisma.js'
import { requireAuth } from '../middleware/auth.middleware.js'

export async function favoriteRoutes(app: FastifyInstance) {
  // GET /favorites — the caller's saved providers and listings
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const favorites = await prisma.favorite.findMany({
      where: { userId: request.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        provider: {
          include: { user: { select: { displayName: true, profilePhotoUrl: true } } },
        },
        listing: {
          include: { category: { select: { id: true, name: true, icon: true } } },
        },
      },
    })

    return reply.send({
      providers: favorites
        .filter((f) => f.provider)
        .map((f) => ({
          favoriteId: f.id,
          id: f.provider!.id,
          displayName: f.provider!.user.displayName,
          profilePhotoUrl: f.provider!.user.profilePhotoUrl,
          averageRating: f.provider!.averageRating,
          totalReviews: f.provider!.totalReviews,
          savedAt: f.createdAt,
        })),
      listings: favorites
        .filter((f) => f.listing)
        .map((f) => ({
          favoriteId: f.id,
          ...f.listing,
          savedAt: f.createdAt,
        })),
    })
  })

  // POST /favorites/providers/:id — save a provider
  app.post('/providers/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const provider = await prisma.providerProfile.findUnique({ where: { id } })
    if (!provider) return reply.status(404).send({ error: 'PROVIDER_NOT_FOUND' })

    const favorite = await prisma.favorite.upsert({
      where: { userId_providerId: { userId: request.userId, providerId: id } },
      create: { userId: request.userId, providerId: id },
      update: {},
    })
    return reply.status(201).send({ favorite })
  })

  // DELETE /favorites/providers/:id — unsave a provider
  app.delete('/providers/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.favorite.deleteMany({ where: { userId: request.userId, providerId: id } })
    return reply.send({ removed: true })
  })

  // POST /favorites/listings/:id — save a listing
  app.post('/listings/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const listing = await prisma.serviceListing.findUnique({ where: { id } })
    if (!listing) return reply.status(404).send({ error: 'LISTING_NOT_FOUND' })

    const favorite = await prisma.favorite.upsert({
      where: { userId_listingId: { userId: request.userId, listingId: id } },
      create: { userId: request.userId, listingId: id },
      update: {},
    })
    return reply.status(201).send({ favorite })
  })

  // DELETE /favorites/listings/:id — unsave a listing
  app.delete('/listings/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.favorite.deleteMany({ where: { userId: request.userId, listingId: id } })
    return reply.send({ removed: true })
  })
}
