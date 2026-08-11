import type { FastifyInstance } from 'fastify'
import { prisma } from '../config/prisma.js'

export async function customerRoutes(app: FastifyInstance) {
  // GET /customers/:id — public Auftraggeber profile (name, rating, reviews from
  // providers who worked with them). Public like the provider profile — no auth
  // required, this is the marketplace-facing view a provider taps into from a
  // request card or an accepted offer to see who they'd be working with.
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const customer = await prisma.customerProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, displayName: true, profilePhotoUrl: true, createdAt: true } },
        ratings: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { providerRater: { include: { user: { select: { displayName: true } } } } },
        },
      },
    })

    if (!customer) return reply.status(404).send({ error: 'CUSTOMER_NOT_FOUND' })

    const reviews = customer.ratings.map((r) => ({
      id: r.id,
      score: r.score,
      comment: r.comment,
      createdAt: r.createdAt,
      reviewerName: r.providerRater?.user.displayName ?? 'Anonym',
    }))

    return reply.send({
      customer: {
        id: customer.id,
        displayName: customer.user.displayName,
        profilePhotoUrl: customer.user.profilePhotoUrl,
        memberSince: customer.user.createdAt,
        averageRating: customer.averageRating,
        totalReviews: customer.totalReviews,
        reviews,
      },
    })
  })
}
