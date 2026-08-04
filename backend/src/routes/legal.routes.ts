import type { FastifyInstance } from 'fastify'
import { prisma } from '../config/prisma.js'

export async function legalRoutes(app: FastifyInstance) {
  // GET /api/legal-docs — public, no auth required
  app.get('/', async (_request, reply) => {
    const docs = await prisma.legalDocument.findMany({
      where: { isActive: true },
      select: { type: true, title: true, content: true, version: true, publishedAt: true },
      orderBy: { type: 'asc' },
    })
    return reply.send({ documents: docs })
  })

  // GET /api/legal-docs/:type — public, no auth required
  app.get('/:type', async (request, reply) => {
    const { type } = request.params as { type: string }
    const doc = await prisma.legalDocument.findFirst({
      where: { type, isActive: true },
      select: { type: true, title: true, content: true, version: true, publishedAt: true },
    })
    if (!doc) return reply.status(404).send({ error: 'NOT_FOUND' })
    return reply.send({ document: doc })
  })
}
