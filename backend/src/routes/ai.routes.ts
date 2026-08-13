import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.middleware.js'
import { checkRateLimit } from '../lib/rateLimiter.js'
import * as ai from '../services/ai.service.js'

// Every call costs money, so each user gets a modest per-hour allowance on top
// of the global limiter. Keyed on userId, not IP, so one heavy user can't
// exhaust the budget for everyone behind the same connection.
const AI_MAX_PER_HOUR = 30
const AI_WINDOW_MS = 60 * 60 * 1000

function enforceAiQuota(userId: string): boolean {
  return checkRateLimit(`ai:${userId}`, AI_MAX_PER_HOUR, AI_WINDOW_MS)
}

// Maps service-level failures onto statuses and user-facing German copy.
// AI_QUOTA_EXHAUSTED and AI_AUTH_FAILED are operator problems, not user ones,
// so the app should present them as "temporarily unavailable" rather than
// telling the user to try again in a minute — waiting won't help.
const AI_ERRORS: Record<string, { status: number; message: string }> = {
  AI_UNAVAILABLE: { status: 503, message: 'Der Assistent ist derzeit nicht verfügbar.' },
  AI_QUOTA_EXHAUSTED: { status: 503, message: 'Der Assistent ist derzeit nicht verfügbar.' },
  AI_AUTH_FAILED: { status: 503, message: 'Der Assistent ist derzeit nicht verfügbar.' },
  AI_RATE_LIMITED: { status: 429, message: 'Der Assistent ist gerade stark ausgelastet. Bitte versuche es gleich noch einmal.' },
  AI_BAD_RESPONSE: { status: 502, message: 'Der Assistent hat unerwartet geantwortet. Bitte versuche es erneut.' },
}

function replyForAiError(reply: import('fastify').FastifyReply, err: unknown) {
  const code = err instanceof Error ? err.message : 'AI_REQUEST_FAILED'
  const mapped = AI_ERRORS[code] ?? {
    status: 502,
    message: 'Der Assistent konnte nicht antworten. Bitte versuche es erneut.',
  }
  return reply.status(mapped.status).send({ error: code, message: mapped.message })
}

export async function aiRoutes(app: FastifyInstance) {
  // GET /ai/status — lets the app hide AI affordances when it isn't configured
  app.get('/status', async (_request, reply) =>
    reply.send({ available: ai.isAiConfigured() }),
  )

  // POST /ai/draft-request — turn a rough idea into a well-formed request
  app.post('/draft-request', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        rough: z.string().min(3).max(1000),
        categoryName: z.string().max(100).optional(),
        city: z.string().max(100).optional(),
      })
      .safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }
    if (!enforceAiQuota(request.userId)) {
      return reply.status(429).send({
        error: 'AI_QUOTA_EXCEEDED',
        message: 'Du hast das stündliche Limit für den Assistenten erreicht. Bitte versuche es später erneut.',
      })
    }

    try {
      return reply.send({ draft: await ai.draftServiceRequest(body.data) })
    } catch (err) {
      return replyForAiError(reply, err)
    }
  })

  // POST /ai/ask — general in-app assistant
  app.post('/ask', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        question: z.string().min(2).max(1000),
        history: z
          .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
          .max(12)
          .optional(),
      })
      .safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }
    if (!enforceAiQuota(request.userId)) {
      return reply.status(429).send({
        error: 'AI_QUOTA_EXCEEDED',
        message: 'Du hast das stündliche Limit für den Assistenten erreicht. Bitte versuche es später erneut.',
      })
    }

    try {
      const answer = await ai.askAssistant({
        question: body.data.question,
        role: request.userRole,
        history: body.data.history,
      })
      return reply.send({ answer })
    } catch (err) {
      return replyForAiError(reply, err)
    }
  })

  // POST /ai/suggest-price — price guidance for a provider writing an offer
  app.post('/suggest-price', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        requestTitle: z.string().min(2).max(200),
        requestDescription: z.string().min(2).max(2000),
        categoryName: z.string().max(100).optional(),
      })
      .safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }
    if (!enforceAiQuota(request.userId)) {
      return reply.status(429).send({ error: 'AI_QUOTA_EXCEEDED' })
    }

    try {
      return reply.send({ suggestion: await ai.suggestOfferPrice(body.data) })
    } catch (err) {
      return replyForAiError(reply, err)
    }
  })
}
