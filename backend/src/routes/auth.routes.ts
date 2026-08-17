import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import * as authService from '../services/auth.service.js'
import { checkLoginAllowed } from '../services/moderation.service.js'
import { checkRateLimit } from '../lib/rateLimiter.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { env } from '../config/env.js'
import { v4 as uuidv4 } from 'uuid'

const registerSchema = z.object({
  email: z.string().email(),
  phone: z.string().regex(/^\+49[0-9]{10,11}$/, 'Must be a German phone number (+49...)'),
  password: z.string().min(8),
  displayName: z.string().min(2).max(100),
  role: z.enum(['CUSTOMER', 'PROVIDER']),
  deviceId: z.string().optional(),
  consentVersion: z.string().optional(),
  referralCode: z.string().min(4).max(20).optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  deviceId: z.string().optional(),
})

const resetRequestSchema = z.object({ email: z.string().email() })

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8),
})

const mfaCodeSchema = z.object({ token: z.string().min(6).max(20) })
const mfaChallengeSchema = z.object({
  challengeToken: z.string(),
  token: z.string().min(6).max(20),
  deviceId: z.string().optional(),
  trustDevice: z.boolean().optional(),
})
const mfaDisableSchema = z.object({ password: z.string() })
const deviceChallengeSchema = z.object({
  challengeToken: z.string(),
  code: z.string().length(6),
  trustDevice: z.boolean().optional(),
})

// OTP-bearing endpoints (registration, resend, password reset) are rate-limited
// per IP + purpose, independent of the global request limiter: max 3 per 10 min.
const OTP_RATE_LIMIT_MAX = 3
const OTP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000

function enforceOtpRateLimit(reply: import('fastify').FastifyReply, ip: string, purpose: string): boolean {
  const allowed = checkRateLimit(`otp:${purpose}:${ip}`, OTP_RATE_LIMIT_MAX, OTP_RATE_LIMIT_WINDOW_MS)
  if (!allowed) {
    reply.status(429).send({ error: 'RATE_LIMITED', message: 'Zu viele Anfragen. Bitte in 10 Minuten erneut versuchen.' })
  }
  return allowed
}

function publicUser(user: {
  id: string
  email: string
  displayName: string
  role: string
  emailVerified: boolean
  phoneVerified: boolean
  verificationStatus: string
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    verificationStatus: user.verificationStatus,
  }
}

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/register
  app.post('/register', async (request, reply) => {
    const body = registerSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    if (!enforceOtpRateLimit(reply, request.ip, 'register')) return

    try {
      const user = await authService.registerUser({
        ...body.data,
        registrationIp: request.ip,
        registrationDeviceId: body.data.deviceId,
      })
      return reply.status(201).send({
        message: 'Registration successful. Please verify your email and phone.',
        userId: user.id,
        role: user.role,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'UNKNOWN_ERROR'
      if (message === 'EMAIL_TAKEN') return reply.status(409).send({ error: 'EMAIL_TAKEN' })
      if (message === 'PHONE_TAKEN') return reply.status(409).send({ error: 'PHONE_TAKEN' })
      if (message === 'BLACKLISTED') return reply.status(403).send({ error: 'BLACKLISTED' })
      if (message === 'IP_BANNED' || message === 'DEVICE_BANNED') {
        return reply.status(403).send({ error: message })
      }
      throw err
    }
  })

  // POST /auth/login
  // Login gets its own rate-limit bucket rather than sharing the global one.
  // Sharing meant a session's ordinary polling (chat, notification badge,
  // screen queries) could exhaust the budget and then lock the user out of
  // signing back in after a logout. This budget is only ever spent by actual
  // login attempts, so it can stay tight enough to blunt brute-forcing while
  // never being drained by normal use. Keyed on IP because there is no
  // authenticated user yet at this point.
  app.post('/login', {
    config: {
      rateLimit: {
        max: env.NODE_ENV === 'production' ? 20 : 200,
        timeWindow: '1 minute',
        keyGenerator: (request: FastifyRequest) => request.ip,
      },
    },
  }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    try {
      await checkLoginAllowed(request.ip, body.data.deviceId)
      const user = await authService.loginUser(body.data.email, body.data.password)
      const deviceId = body.data.deviceId

      if (user.mfaEnabled) {
        // A device already trusted from a prior MFA confirmation skips the 2FA prompt
        if (deviceId && (await authService.isTrustedDevice(user.id, deviceId))) {
          const sessionToken = uuidv4()
          await authService.createSession(user.id, sessionToken, {
            deviceInfo: request.headers['user-agent'],
            ipAddress: request.ip,
            deviceId,
          })
          const token = app.jwt.sign({ sub: user.id, role: user.role, sessionToken })
          return reply.send({ token, user: publicUser(user) })
        }

        const challengeToken = app.jwt.sign({ sub: user.id, mfaChallenge: true }, { expiresIn: '5m' })
        return reply.send({ mfaRequired: true, challengeToken })
      }

      // Suspicious-login detection: a never-before-seen device gets an OTP challenge
      if (deviceId && !(await authService.isKnownDevice(user.id, deviceId))) {
        await authService.sendDeviceChallengeOtp(user.id, user.email)
        const challengeToken = app.jwt.sign({ sub: user.id, deviceChallenge: true, deviceId }, { expiresIn: '10m' })
        return reply.send({ deviceChallengeRequired: true, challengeToken })
      }

      const sessionToken = uuidv4()
      await authService.createSession(user.id, sessionToken, {
        deviceInfo: request.headers['user-agent'],
        ipAddress: request.ip,
        deviceId,
      })

      const token = app.jwt.sign({ sub: user.id, role: user.role, sessionToken })
      return reply.send({ token, user: publicUser(user) })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'UNKNOWN_ERROR'
      if (message === 'INVALID_CREDENTIALS') return reply.status(401).send({ error: 'INVALID_CREDENTIALS' })
      if (message === 'ACCOUNT_SUSPENDED') return reply.status(403).send({ error: 'ACCOUNT_SUSPENDED' })
      if (message === 'IP_BANNED' || message === 'DEVICE_BANNED') {
        return reply.status(403).send({ error: message })
      }
      throw err
    }
  })

  // POST /auth/device-challenge — complete login after a new-device OTP challenge
  app.post('/device-challenge', async (request, reply) => {
    const body = deviceChallengeSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    let userId: string
    let deviceId: string | undefined
    try {
      const payload = app.jwt.verify<{ sub: string; deviceChallenge?: boolean; deviceId?: string }>(
        body.data.challengeToken
      )
      if (!payload.deviceChallenge) throw new Error('INVALID_CHALLENGE')
      userId = payload.sub
      deviceId = payload.deviceId
    } catch {
      return reply.status(401).send({ error: 'CHALLENGE_EXPIRED' })
    }

    try {
      await authService.verifyDeviceChallengeOtp(userId, body.data.code)
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'INVALID_CODE' })
    }

    const user = await authService.getUserById(userId)
    if (!user) return reply.status(404).send({ error: 'USER_NOT_FOUND' })

    const sessionToken = uuidv4()
    await authService.createSession(user.id, sessionToken, {
      deviceInfo: request.headers['user-agent'],
      ipAddress: request.ip,
      deviceId,
      isTrusted: !!body.data.trustDevice,
      trustedUntil: body.data.trustDevice ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined,
    })
    const token = app.jwt.sign({ sub: user.id, role: user.role, sessionToken })

    return reply.send({ token, user: publicUser(user) })
  })

  // POST /auth/mfa/challenge — complete login after an MFA-required response
  app.post('/mfa/challenge', async (request, reply) => {
    const body = mfaChallengeSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    let userId: string
    try {
      const payload = app.jwt.verify<{ sub: string; mfaChallenge?: boolean }>(body.data.challengeToken)
      if (!payload.mfaChallenge) throw new Error('INVALID_CHALLENGE')
      userId = payload.sub
    } catch {
      return reply.status(401).send({ error: 'CHALLENGE_EXPIRED' })
    }

    const ok = await authService.verifyMfaLogin(userId, body.data.token)
    if (!ok) return reply.status(401).send({ error: 'INVALID_CODE' })

    const user = await authService.getUserById(userId)
    if (!user) return reply.status(404).send({ error: 'USER_NOT_FOUND' })

    const sessionToken = uuidv4()
    await authService.createSession(user.id, sessionToken, {
      deviceInfo: request.headers['user-agent'],
      ipAddress: request.ip,
      deviceId: body.data.deviceId,
      isTrusted: !!body.data.trustDevice,
      trustedUntil: body.data.trustDevice ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined,
    })
    const token = app.jwt.sign({ sub: user.id, role: user.role, sessionToken })

    return reply.send({ token, user: publicUser(user) })
  })

  // POST /auth/mfa/setup — begin enabling MFA for the current account
  app.post('/mfa/setup', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const result = await authService.startMfaSetup(request.userId)
      return reply.send(result)
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'ERROR' })
    }
  })

  // POST /auth/mfa/verify-setup — confirm the code and turn MFA on
  app.post('/mfa/verify-setup', { preHandler: requireAuth }, async (request, reply) => {
    const body = mfaCodeSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    try {
      const result = await authService.confirmMfaSetup(request.userId, body.data.token)
      return reply.send(result)
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'ERROR' })
    }
  })

  // POST /auth/mfa/disable
  app.post('/mfa/disable', { preHandler: requireAuth }, async (request, reply) => {
    const body = mfaDisableSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    try {
      await authService.disableMfa(request.userId, body.data.password)
      return reply.send({ message: 'MFA deaktiviert.' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(msg === 'INVALID_CREDENTIALS' ? 401 : 400).send({ error: msg })
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
      await authService.createSession(user.id, sessionToken, {
        deviceInfo: request.headers['user-agent'],
        ipAddress: request.ip,
      })
      const token = app.jwt.sign({ sub: user.id, role: updatedUser!.role, sessionToken })
      return reply.send({ token, user: publicUser(updatedUser!) })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'OTP_INVALID'
      return reply.status(400).send({ error: message })
    }
  })

  // POST /auth/resend-otp — no auth required; lookup by identifier
  app.post('/resend-otp', async (request, reply) => {
    const body = z.object({ identifier: z.string(), type: z.enum(['email', 'phone']) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    if (!enforceOtpRateLimit(reply, request.ip, `resend-${body.data.type}`)) return

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

  // POST /auth/forgot-password — sends a single-use, 1-hour reset link
  app.post('/forgot-password', async (request, reply) => {
    const body = resetRequestSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    if (!enforceOtpRateLimit(reply, request.ip, 'forgot-password')) return

    await authService.initiatePasswordReset(body.data.email)
    return reply.send({ message: 'Falls ein Konto existiert, wurde ein Link zum Zurücksetzen gesendet.' })
  })

  // POST /auth/reset-password — consumes the token from the emailed link
  app.post('/reset-password', async (request, reply) => {
    const body = resetPasswordSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    try {
      await authService.resetPasswordWithToken(body.data.token, body.data.newPassword)
      return reply.send({ message: 'Passwort erfolgreich zurückgesetzt.' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'RESET_FAILED'
      return reply.status(400).send({ error: message })
    }
  })
}
