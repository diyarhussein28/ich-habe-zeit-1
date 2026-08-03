import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as categoryService from '../services/category.service.js'
import { requireRole } from '../middleware/auth.middleware.js'
import { prisma } from '../config/prisma.js'

const createCategorySchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  iconUrl: z.string().url().optional(),
  parentId: z.string().uuid().optional(),
  commissionRate: z.number().min(0).max(1).optional(),
  geoRestrictions: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),
})

export async function categoryRoutes(app: FastifyInstance) {
  // GET /categories — public
  app.get('/', async (request, reply) => {
    const categories = await categoryService.listCategories()
    return reply.send({ categories })
  })

  // GET /categories/:id — public
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const category = await categoryService.getCategoryById(id)
    if (!category) return reply.status(404).send({ error: 'NOT_FOUND' })
    return reply.send({ category })
  })

  // GET /categories/:id/providers — public: list available verified providers for a category
  app.get('/:id/providers', async (request, reply) => {
    const { id } = request.params as { id: string }
    const providerCategories = await prisma.providerCategory.findMany({
      where: { categoryId: id, providerProfile: { isAvailable: true } },
      include: {
        providerProfile: {
          include: {
            user: { select: { id: true, displayName: true, email: true } },
          },
        },
      },
      orderBy: { providerProfile: { averageRating: 'desc' } },
      take: 50,
    })
    const providers = providerCategories.map((pc) => ({
      id: pc.providerProfile.id,
      userId: pc.providerProfile.userId,
      displayName: pc.providerProfile.user.displayName,
      bio: pc.providerProfile.bio,
      averageRating: pc.providerProfile.averageRating,
      totalReviews: pc.providerProfile.totalReviews,
      languages: pc.providerProfile.languages,
      isAvailable: pc.providerProfile.isAvailable,
    }))
    return reply.send({ providers })
  })

  // POST /categories — admin only
  app.post('/', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const body = createCategorySchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    try {
      const category = await categoryService.createCategory(body.data)
      return reply.status(201).send({ category })
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'SLUG_TAKEN') {
        return reply.status(409).send({ error: 'SLUG_TAKEN' })
      }
      throw err
    }
  })

  // PATCH /categories/:id — admin only
  app.patch('/:id', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = createCategorySchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    const category = await categoryService.updateCategory(id, body.data)
    return reply.send({ category })
  })
}
