import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import Expo from 'expo-server-sdk'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../config/prisma.js'

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android']),
})

export async function notificationsRoutes(app: FastifyInstance) {
  // POST /api/notifications/token — register or refresh a push token
  app.post('/token', { preHandler: requireAuth }, async (request, reply) => {
    const body = registerSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }

    const { token, platform } = body.data

    if (!Expo.isExpoPushToken(token)) {
      return reply.status(400).send({ error: 'INVALID_EXPO_PUSH_TOKEN' })
    }

    await prisma.pushToken.upsert({
      where: { token },
      update: { userId: request.userId, platform, updatedAt: new Date() },
      create: { userId: request.userId, token, platform },
    })

    return reply.send({ registered: true })
  })

  // DELETE /api/notifications/token — unregister on logout
  app.delete('/token', { preHandler: requireAuth }, async (request, reply) => {
    const body = z.object({ token: z.string() }).safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR' })
    }

    await prisma.pushToken.deleteMany({
      where: { token: body.data.token, userId: request.userId },
    })

    return reply.send({ unregistered: true })
  })

  // GET /api/notifications — in-app inbox, newest first
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const query = z
      .object({ limit: z.coerce.number().min(1).max(100).default(50), offset: z.coerce.number().min(0).default(0) })
      .parse(request.query)

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: request.userId },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.notification.count({ where: { userId: request.userId, readAt: null } }),
    ])

    return reply.send({ notifications, unreadCount })
  })

  // GET /api/notifications/unread-count — lightweight, for a badge
  app.get('/unread-count', { preHandler: requireAuth }, async (request, reply) => {
    const unreadCount = await prisma.notification.count({ where: { userId: request.userId, readAt: null } })
    return reply.send({ unreadCount })
  })

  // PATCH /api/notifications/:id/read
  app.patch('/:id/read', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await prisma.notification.updateMany({
      where: { id, userId: request.userId },
      data: { readAt: new Date() },
    })
    if (result.count === 0) return reply.status(404).send({ error: 'NOT_FOUND' })
    return reply.send({ read: true })
  })

  // POST /api/notifications/read-all
  app.post('/read-all', { preHandler: requireAuth }, async (request, reply) => {
    await prisma.notification.updateMany({
      where: { userId: request.userId, readAt: null },
      data: { readAt: new Date() },
    })
    return reply.send({ read: true })
  })
}
