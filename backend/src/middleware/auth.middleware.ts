import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../config/prisma.js'

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
    userRole: string
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()

    const payload = request.user as { sub: string; role: string; sessionToken: string }

    // Verify session is still active
    const session = await prisma.session.findFirst({
      where: {
        token: payload.sessionToken,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    })

    if (!session) {
      return reply.status(401).send({ error: 'SESSION_EXPIRED' })
    }

    request.userId = payload.sub
    request.userRole = payload.role
  } catch {
    return reply.status(401).send({ error: 'UNAUTHORIZED' })
  }
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply)
    if (!roles.includes(request.userRole)) {
      return reply.status(403).send({ error: 'FORBIDDEN' })
    }
  }
}

export async function requireVerified(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply)

  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { emailVerified: true, phoneVerified: true, isActive: true },
  })

  if (!user?.isActive) return reply.status(403).send({ error: 'ACCOUNT_SUSPENDED' })
  if (!user.emailVerified || !user.phoneVerified) {
    return reply.status(403).send({ error: 'VERIFICATION_REQUIRED' })
  }
}
