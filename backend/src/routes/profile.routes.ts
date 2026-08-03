import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as profileService from '../services/profile.service.js'
import * as providerService from '../services/provider.service.js'
import { requireAuth, requireRole } from '../middleware/auth.middleware.js'
import { prisma } from '../config/prisma.js'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  profilePhotoUrl: z.string().url().optional(),
  dateOfBirth: z.coerce.date().optional(),
})

const addressSchema = z.object({
  label: z.string().min(1).max(50),
  street: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  plz: z.string().regex(/^\d{5}$/, 'Must be a 5-digit German PLZ'),
  lat: z.number().optional(),
  lon: z.number().optional(),
  isDefault: z.boolean().optional(),
})

const updateAddressSchema = z.object({
  label: z.string().min(1).max(50).optional(),
  street: z.string().min(1).max(200).optional(),
  city: z.string().min(1).max(100).optional(),
  plz: z.string().regex(/^\d{5}$/).optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  isDefault: z.boolean().optional(),
})

const notificationSettingsSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  newOfferPush: z.boolean().optional(),
  newOfferEmail: z.boolean().optional(),
  chatMessagePush: z.boolean().optional(),
  marketingEmail: z.boolean().optional(),
})

const updateProviderProfileSchema = z.object({
  bio: z.string().max(2000).optional(),
  servicePhotoUrls: z.array(z.string().url()).max(10).optional(),
  pricingModel: z.enum(['PER_HOUR', 'FIXED_PRICE', 'CUSTOM_QUOTE'] as const).optional(),
  languages: z.array(z.string().min(2).max(10)).min(1).optional(),
  workingHours: z.record(z.string(), z.unknown()).optional(),
  isAvailable: z.boolean().optional(),
})

const taxInfoSchema = z.object({
  isKleinunternehmer: z.boolean(),
  vatNumber: z.string().optional(),
  legalName: z.string().min(1).max(200),
  taxId: z.string().optional(),
})

const serviceAreasSchema = z.object({
  areas: z.array(
    z.object({
      homePlz: z.string().regex(/^\d{5}$/),
      radiusKm: z.number().int().min(1).max(200),
      plzList: z.array(z.string().regex(/^\d{5}$/)).optional(),
    })
  ),
})

const providerCategoriesSchema = z.object({
  categoryIds: z.array(z.string().uuid()),
})

// ─── Route registration ───────────────────────────────────────────────────────

export async function profileRoutes(app: FastifyInstance) {
  // GET /profile — own profile
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const profile = await profileService.getMyProfile(request.userId)
      return reply.send({ profile })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(404).send({ error: msg })
    }
  })

  // PATCH /profile — update display name, photo, DOB
  app.patch('/', { preHandler: requireAuth }, async (request, reply) => {
    const body = updateProfileSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }

    try {
      const profile = await profileService.updateMyProfile(request.userId, body.data)
      return reply.send({ profile })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // GET /profile/addresses
  app.get('/addresses', { preHandler: requireAuth }, async (request, reply) => {
    const addresses = await profileService.listAddresses(request.userId)
    return reply.send({ addresses })
  })

  // POST /profile/addresses
  app.post('/addresses', { preHandler: requireAuth }, async (request, reply) => {
    const body = addressSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }

    try {
      const address = await profileService.addAddress(request.userId, body.data)
      return reply.status(201).send({ address })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // PATCH /profile/addresses/:id
  app.patch('/addresses/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateAddressSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }

    try {
      const address = await profileService.updateAddress(id, request.userId, body.data)
      return reply.send({ address })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      const status = msg === 'FORBIDDEN' ? 403 : msg === 'ADDRESS_NOT_FOUND' ? 404 : 400
      return reply.status(status).send({ error: msg })
    }
  })

  // DELETE /profile/addresses/:id
  app.delete('/addresses/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await profileService.deleteAddress(id, request.userId)
      return reply.send({ message: 'Address deleted' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      const status = msg === 'FORBIDDEN' ? 403 : msg === 'ADDRESS_NOT_FOUND' ? 404 : 400
      return reply.status(status).send({ error: msg })
    }
  })

  // GET /profile/notifications
  app.get('/notifications', { preHandler: requireAuth }, async (request, reply) => {
    const settings = await profileService.getNotificationSettings(request.userId)
    return reply.send({ settings })
  })

  // PATCH /profile/notifications
  app.patch('/notifications', { preHandler: requireAuth }, async (request, reply) => {
    const body = notificationSettingsSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }

    const settings = await profileService.updateNotificationSettings(request.userId, body.data)
    return reply.send({ settings })
  })

  // GET /profile/provider — provider's own full profile
  app.get('/provider', { preHandler: requireRole('PROVIDER') }, async (request, reply) => {
    try {
      const profile = await providerService.getProviderProfile(request.userId)
      return reply.send({ profile })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(404).send({ error: msg })
    }
  })

  // PATCH /profile/provider
  app.patch('/provider', { preHandler: requireRole('PROVIDER') }, async (request, reply) => {
    const body = updateProviderProfileSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }

    try {
      const profile = await providerService.updateProviderProfile(request.userId, body.data)
      return reply.send({ profile })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // PATCH /profile/provider/tax
  app.patch('/provider/tax', { preHandler: requireRole('PROVIDER') }, async (request, reply) => {
    const body = taxInfoSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }

    try {
      const profile = await providerService.updateTaxInfo(request.userId, body.data)
      return reply.send({ profile })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })

  // PUT /profile/provider/service-areas
  app.put(
    '/provider/service-areas',
    { preHandler: requireRole('PROVIDER') },
    async (request, reply) => {
      const body = serviceAreasSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
      }

      try {
        const areas = await providerService.setServiceAreas(request.userId, body.data.areas)
        return reply.send({ areas })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'ERROR'
        return reply.status(400).send({ error: msg })
      }
    }
  )

  // GET /profile/provider/categories
  app.get('/provider/categories', { preHandler: requireRole('PROVIDER') }, async (request, reply) => {
    const profile = await prisma.providerProfile.findUnique({ where: { userId: request.userId } })
    if (!profile) return reply.send({ categories: [] })
    const rows = await prisma.providerCategory.findMany({
      where: { providerProfileId: profile.id },
      include: { category: { select: { id: true, name: true, icon: true } } },
    })
    return reply.send({ categories: rows.map((r) => ({ ...r.category, isVerified: r.isVerified })) })
  })

  // PUT /profile/provider/categories
  app.put(
    '/provider/categories',
    { preHandler: requireRole('PROVIDER') },
    async (request, reply) => {
      const body = providerCategoriesSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
      }

      try {
        const categories = await providerService.setProviderCategories(
          request.userId,
          body.data.categoryIds
        )
        return reply.send({ categories })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'ERROR'
        return reply.status(400).send({ error: msg })
      }
    }
  )

  // GET /profile/providers/:id — public, no auth required
  app.get('/providers/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const profile = await providerService.getPublicProfile(id)
      return reply.send({ profile })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(404).send({ error: msg })
    }
  })
}
