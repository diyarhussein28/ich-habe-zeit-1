import Fastify from 'fastify'
import { ZodError } from 'zod'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { env } from './config/env.js'
import { authRoutes } from './routes/auth.routes.js'
import { categoryRoutes } from './routes/category.routes.js'
import { requestRoutes } from './routes/request.routes.js'
import { orderRoutes } from './routes/order.routes.js'
import { profileRoutes } from './routes/profile.routes.js'
import { adminRoutes } from './routes/admin.routes.js'
import { invoiceRoutes } from './routes/invoice.routes.js'
import { kycRoutes } from './routes/kyc.routes.js'
import { notificationsRoutes } from './routes/notifications.routes.js'
import { stripeRoutes } from './routes/stripe.routes.js'
import { listingRoutes } from './routes/listing.routes.js'
import { legalRoutes } from './routes/legal.routes.js'
import { supportRoutes } from './routes/support.routes.js'
import { mediaRoutes } from './routes/media.routes.js'
import { providerRoutes } from './routes/provider.routes.js'
import { customerRoutes } from './routes/customer.routes.js'
import { geoRoutes } from './routes/geo.routes.js'
import { negotiationRoutes } from './routes/negotiation.routes.js'
import { aiRoutes } from './routes/ai.routes.js'
import { chatGateway } from './ws/chat.gateway.js'
import { PUBLIC_UPLOADS_DIR } from './services/media.service.js'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'warn' : 'info',
    },
  })

  // Security headers
  await app.register(helmet)

  // CORS
  await app.register(cors, {
    origin: env.NODE_ENV === 'production' ? false : true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  // JWT
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN as string },
  })

  // Rate limiting.
  //
  // Keyed per *user* when authenticated, falling back to IP for anonymous
  // traffic. Keying on IP alone punished households: two testers on the same
  // WiFi share one public IP, so they drained a single shared bucket and locked
  // each other out.
  //
  // The cap also has to survive normal app behaviour: an open chat polls, the
  // notification bell polls, and every screen fires several queries on mount.
  // At 100/min a legitimate session exhausted its budget within minutes — and
  // because /auth/login shared that same bucket, the symptom was being unable
  // to log back in after logging out. Auth routes now get their own budget
  // (see auth.routes.ts) so ordinary traffic can never lock a user out.
  await app.register(rateLimit, {
    max: env.NODE_ENV === 'production' ? 600 : 5000,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.userId ?? request.ip,
  })

  // Multipart (for KYC + media uploads)
  await app.register(multipart)

  // Static file serving for publicly-viewable images (profile/service/request/completion photos)
  await (await import('node:fs/promises')).mkdir(PUBLIC_UPLOADS_DIR, { recursive: true })
  await app.register(fastifyStatic, {
    root: PUBLIC_UPLOADS_DIR,
    prefix: '/media/',
    decorateReply: false,
  })

  // WebSocket
  await app.register(websocket)
  await app.register(chatGateway)

  // Malformed input is the caller's mistake, not a server fault. Several routes
  // validate query params with Zod's throwing `.parse`, which without this
  // surfaced as an opaque 500 — e.g. `?minRating=99` on a 0–5 field. Catching
  // ZodError centrally fixes every such route at once, including any added
  // later, and matches the shape the safeParse routes already return.
  //
  // Must be registered before the route plugins: each `register` creates its
  // own encapsulation context, and a handler added afterwards does not apply
  // retroactively to contexts already created.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: error.flatten() })
    }

    const err = error as { statusCode?: number; code?: string; message?: string }
    const statusCode = err.statusCode ?? 500
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Unhandled error')
      return reply.status(statusCode).send({ error: 'INTERNAL_SERVER_ERROR' })
    }
    return reply.status(statusCode).send({ error: err.code ?? 'REQUEST_ERROR', message: err.message })
  })

  // Routes
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(categoryRoutes, { prefix: '/api/categories' })
  await app.register(requestRoutes, { prefix: '/api/requests' })
  await app.register(orderRoutes, { prefix: '/api/orders' })
  await app.register(profileRoutes, { prefix: '/api/profile' })
  await app.register(adminRoutes, { prefix: '/api/admin' })
  await app.register(invoiceRoutes, { prefix: '/api/invoices' })
  await app.register(kycRoutes, { prefix: '/api/kyc' })
  await app.register(notificationsRoutes, { prefix: '/api/notifications' })
  await app.register(stripeRoutes, { prefix: '/api/stripe' })
  await app.register(listingRoutes, { prefix: '/api/listings' })
  await app.register(legalRoutes, { prefix: '/api/legal-docs' })
  await app.register(supportRoutes, { prefix: '/api/support' })
  await app.register(mediaRoutes, { prefix: '/api/media' })
  await app.register(providerRoutes, { prefix: '/api/providers' })
  await app.register(customerRoutes, { prefix: '/api/customers' })
  await app.register(geoRoutes, { prefix: '/api/geo' })
  await app.register(negotiationRoutes, { prefix: '/api/negotiations' })
  await app.register(aiRoutes, { prefix: '/api/ai' })

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  return app
}
