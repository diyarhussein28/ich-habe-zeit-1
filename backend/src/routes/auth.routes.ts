import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as authService from '../services/auth.service.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { v4 as uuidv4 } from 'uuid'

const registerSchema = z.object({
  email: z.string().email(),
  phone: z.string().regex(/^\+49[0-9]{10,11}$/, 'Must be a German phone number (+49...)'),
  password: z.string().min(8),
  displayName: z.string().min(2).max(100),
  role: z.enum(['CUSTOMER', 'PROVIDER']),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const otpSchema = z.object({
  code: z.string().length(6),
})

const resetRequestSchema = z.object({ email: z.string().email() })

const resetPasswordSchema = z.object({
  code: z.string().length(6),
  newPassword: z.string().min(8),
})

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/register
  app.post('/register', async (request, reply) => {
    const body = registerSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    try {
      const user = await authService.registerUser(body.data)
      return reply.status(201).send({
        message: 'Registration successful. Please verify your email and phone.',
        userId: user.id,
        role: user.role,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'UNKNOWN_ERROR'
      if (message === 'EMAIL_TAKEN') return reply.status(409).send({ error: 'EMAIL_TAKEN' })
      if (message === 'PHONE_TAKEN') return reply.status(409).send({ error: 'PHONE_TAKEN' })
      throw err
    }
  })

  // POST /auth/login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    try {
      const user = await authService.loginUser(body.data.email, body.data.password)
      const sessionToken = uuidv4()

      await authService.createSession(
        user.id,
        sessionToken,
        request.headers['user-agent'],
        request.ip
      )

      const token = app.jwt.sign({
        sub: user.id,
        role: user.role,
        sessionToken,
      })

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          emailVerified: user.emailVerified,
          phoneVerified: user.phoneVerified,
          verificationStatus: user.verificationStatus,
        },
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'UNKNOWN_ERROR'
      if (message === 'INVALID_CREDENTIALS') return reply.status(401).send({ error: 'INVALID_CREDENTIALS' })
      if (message === 'ACCOUNT_SUSPENDED') return reply.status(403).send({ error: 'ACCOUNT_SUSPENDED' })
      throw err
    }
  })

  // POST /auth/verify/email — no auth required; OTP is the auth factor
  app.post('/verify/email', async (request, reply) => {
    const body = z.object({ code: z.string().length(6), identifier: z.string().email() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    const { prisma } = await import('../config/prisma.js')
    const user = await prisma.user.findUnique({ where: { email: body.data.identifier } })
    if (!user) return reply.status(404).send({ error: 'USER_NOT_FOUND' })

    try {
      await authService.verifyEmailOtp(user.id, body.data.code)
      return reply.send({ message: 'Email verified successfully.' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'OTP_INVALID'
      return reply.status(400).send({ error: message })
    }
  })

  // POST /auth/verify/phone — no auth required; returns token on success
  app.post('/verify/phone', async (request, reply) => {
    const body = z.object({ code: z.string().length(6), identifier: z.string().email() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    const { prisma } = await import('../config/prisma.js')
    const user = await prisma.user.findUnique({ where: { email: body.data.identifier } })
    if (!user) return reply.status(404).send({ error: 'USER_NOT_FOUND' })

    try {
      await authService.verifyPhoneOtp(user.id, body.data.code)
      const updatedUser = await prisma.user.findUnique({ where: { id: user.id } })
      const sessionToken = uuidv4()
      await authService.createSession(user.id, sessionToken, request.headers['user-agent'], request.ip)
      const token = app.jwt.sign({ sub: user.id, role: updatedUser!.role, sessionToken })
      return reply.send({
        token,
        user: {
          id: updatedUser!.id,
          email: updatedUser!.email,
          displayName: updatedUser!.displayName,
          role: updatedUser!.role,
          emailVerified: updatedUser!.emailVerified,
          phoneVerified: updatedUser!.phoneVerified,
          verificationStatus: updatedUser!.verificationStatus,
        },
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'OTP_INVALID'
      return reply.status(400).send({ error: message })
    }
  })

  // POST /auth/resend-otp — no auth required; lookup by identifier
  app.post('/resend-otp', async (request, reply) => {
    const body = z.object({ identifier: z.string(), type: z.enum(['email', 'phone']) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    const { prisma } = await import('../config/prisma.js')
    const user = await prisma.user.findUnique({ where: { email: body.data.identifier } })
    if (!user) return reply.send({ message: 'OTP sent.' }) // silent — don't reveal existence

    await authService.resendOtp(user.id, body.data.type)
    return reply.send({ message: 'OTP sent.' })
  })

  // POST /auth/logout
  app.post('/logout', { preHandler: requireAuth }, async (request, reply) => {
    await authService.revokeAllSessions(request.userId)
    return reply.send({ message: 'Logged out from all devices.' })
  })

  // POST /auth/forgot-password
  app.post('/forgot-password', async (request, reply) => {
    const body = resetRequestSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    await authService.initiatePasswordReset(body.data.email)
    return reply.send({ message: 'If an account exists, a reset code has been sent.' })
  })

  // POST /auth/reset-password
  app.post('/reset-password', async (request, reply) => {
    const body = z
      .object({ email: z.string().email() })
      .merge(resetPasswordSchema)
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    const user = await (await import('../config/prisma.js')).prisma.user.findUnique({
      where: { email: body.data.email },
    })
    if (!user) return reply.send({ message: 'If an account exists, the password has been reset.' })

    try {
      await authService.resetPassword(user.id, body.data.code, body.data.newPassword)
      return reply.send({ message: 'Password reset successfully.' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'RESET_FAILED'
      return reply.status(400).send({ error: message })
    }
  })
}
