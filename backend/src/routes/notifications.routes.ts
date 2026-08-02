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
}
