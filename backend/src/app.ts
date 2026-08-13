import Fastify from 'fastify'
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

  // Rate limiting — a single mobile session firing several concurrent screen
  // queries (esp. right after login) can burst well past 100/min in dev; keep
  // production strict but don't throttle local/dev testing.
  await app.register(rateLimit, {
    max: env.NODE_ENV === 'production' ? 100 : 2000,
    timeWindow: '1 minute',
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

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  return app
}
