import fs from 'node:fs'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { OrderStatus } from '@prisma/client'
import type { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { requireRole } from '../middleware/auth.middleware.js'
import { updateKycStatus } from '../services/provider.service.js'
import { getKycDocuments } from '../services/kyc.service.js'
import * as supportService from '../services/support.service.js'
import { notifyEvent } from '../services/notification.service.js'
import * as moderationService from '../services/moderation.service.js'
import * as disputeService from '../services/dispute.service.js'
import { broadcastOrderEvent } from '../ws/chat.gateway.js'
import type { BlacklistIdentifierType, BanType } from '@prisma/client'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'ERROR'
}

async function writeAuditLog(
  adminUserId: string,
  actionType: string,
  targetEntity: string,
  targetId: string,
  metadata?: Record<string, unknown>,
  targetUserId?: string
) {
  await prisma.auditLog.create({
    data: {
      userId: adminUserId,
      targetUserId,
      actionType,
      targetEntity,
      targetId,
      ...(metadata !== undefined && { metadata: metadata as Prisma.InputJsonValue }),
    },
  })
}

type CommissionRuleWithCategory = Prisma.CommissionRuleGetPayload<{
  include: { category: { select: { id: true; name: true; slug: true } } }
}>

function mapCommissionRule(rule: CommissionRuleWithCategory) {
  return {
    id: rule.id,
    scope: rule.isGlobal ? 'GLOBAL' : rule.cityCode ? 'CITY' : 'CATEGORY',
    rate: rule.rate,
    categoryId: rule.categoryId ?? undefined,
    city: rule.cityCode ?? undefined,
    category: rule.category ?? undefined,
    createdAt: rule.createdAt,
  }
}

const legalTypeMap: Record<string, string> = {
  agb: 'AGB',
  privacy_policy: 'DATENSCHUTZ',
  impressum: 'IMPRESSUM',
  cancellation: 'WIDERRUF',
  dispute_policy: 'STREITSCHLICHTUNG',
  review_policy: 'BEWERTUNGSRICHTLINIE',
  cookie_policy: 'COOKIE_RICHTLINIE',
  provider_terms: 'ANBIETER_AGB',
}

const legalReverseTypeMap: Record<string, string> = Object.fromEntries(
  Object.entries(legalTypeMap).map(([k, v]) => [v, k])
)

// ─── Schemas ──────────────────────────────────────────────────────────────────

const userStatusSchema = z.object({
  action: z.enum(['suspend', 'activate', 'restrict_payout'] as const),
})

const kycUpdateSchema = z.object({
  status: z.enum(['KYC_VERIFIED', 'KYC_REJECTED'] as const),
  note: z.string().max(1000).optional(),
})

const kycUpdateSchemaV2 = z.object({
  status: z.enum(['KYC_VERIFIED', 'KYC_REJECTED', 'KYC_RESUBMISSION'] as const),
  notes: z.string().max(1000).optional(),
})

const assignDisputeSchema = z.object({
  assignedToId: z.string().uuid(),
})

const recommendDisputeSchema = z.object({
  recommendation: z.enum([
    'FULL_RELEASE',
    'PARTIAL_RELEASE',
    'FULL_REFUND',
    'REWORK_AGREEMENT',
    'ESCALATED',
  ] as const),
  note: z.string().min(10).max(2000),
})

const resolveDisputeSchema = z.object({
  outcome: z.enum([
    'FULL_RELEASE',
    'PARTIAL_RELEASE',
    'FULL_REFUND',
    'REWORK_AGREEMENT',
    'ESCALATED',
  ] as const),
  resolutionNote: z.string().min(10).max(2000),
  releasedAmount: z.number().positive().optional(),
})

const assignTicketSchema = z.object({
  assignedToId: z.string().uuid(),
})

const updateTicketStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const),
})

const ticketStaffMessageSchema = z.object({
  content: z.string().min(1).max(2000),
  isInternal: z.boolean().optional(),
})

const commissionRuleSchema = z.object({
  categoryId: z.string().uuid().optional(),
  cityCode: z.string().max(20).optional(),
  rate: z.number().min(0).max(1),
  minimumAmount: z.number().positive().optional(),
  isGlobal: z.boolean().optional(),
})

const commissionRateInputSchema = z.object({
  scope: z.enum(['GLOBAL', 'CATEGORY', 'CITY'] as const),
  rate: z.number().min(0).max(1),
  categoryId: z.string().uuid().optional(),
  city: z.string().max(20).optional(),
})

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  page: z.coerce.number().int().min(1).optional(),
})

// ─── Route registration ───────────────────────────────────────────────────────

export async function adminRoutes(app: FastifyInstance) {
  // ── Users ────────────────────────────────────────────────────────────────

  // GET /admin/users
  app.get('/users', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const query = z
      .object({
        search: z.string().optional(),
        role: z.enum(['CUSTOMER', 'PROVIDER', 'HELP_DESK', 'ADMIN'] as const).optional(),
        verificationStatus: z
          .enum([
            'REGISTERED',
            'PROFILE_COMPLETE',
            'KYC_PENDING',
            'KYC_VERIFIED',
            'KYC_REJECTED',
            'KYC_RESUBMISSION',
            'PAYOUT_RESTRICTED',
            'SUSPENDED',
          ] as const)
          .optional(),
        ...paginationSchema.shape,
      })
      .parse(request.query)

    const where: Prisma.UserWhereInput = {}
    if (query.search) {
      where.OR = [
        { displayName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ]
    }
    if (query.role) where.role = query.role
    if (query.verificationStatus) where.verificationStatus = query.verificationStatus

    const offset = query.page != null ? (query.page - 1) * query.limit : query.offset

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          displayName: true,
          profilePhotoUrl: true,
          role: true,
          verificationStatus: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: offset,
      }),
    ])

    return reply.send({ data: users, total, hasMore: offset + query.limit < total })
  })

  // GET /admin/users/:id
  app.get('/users/:id', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        customerProfile: true,
        providerProfile: {
          include: {
            serviceAreas: true,
            providerCategories: { include: { category: true } },
          },
        },
        addresses: true,
        consentRecords: { orderBy: { acceptedAt: 'desc' }, take: 10 },
      },
    })

    if (!user) return reply.status(404).send({ error: 'USER_NOT_FOUND' })

    const { passwordHash, mfaSecret, ...safeUser } = user
    return reply.send({ user: safeUser })
  })

  // PATCH /admin/users/:id/status
  app.patch(
    '/users/:id/status',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = userStatusSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
      }

      const user = await prisma.user.findUnique({ where: { id } })
      if (!user) return reply.status(404).send({ error: 'USER_NOT_FOUND' })

      const actionMap = {
        suspend: { isActive: false, verificationStatus: 'SUSPENDED' as const },
        activate: { isActive: true, verificationStatus: 'KYC_VERIFIED' as const },
        restrict_payout: { verificationStatus: 'PAYOUT_RESTRICTED' as const },
      }

      const updateData = actionMap[body.data.action]

      const updated = await prisma.user.update({
        where: { id },
        data: updateData,
        select: { id: true, verificationStatus: true, isActive: true },
      })

      await writeAuditLog(
        request.userId,
        `USER_${body.data.action.toUpperCase()}`,
        'User',
        id,
        {
          previousStatus: user.verificationStatus,
          previousIsActive: user.isActive,
          action: body.data.action,
        },
        id
      )

      const statusMessages: Record<typeof body.data.action, { title: string; body: string }> = {
        suspend: { title: 'Konto gesperrt', body: 'Ihr Konto wurde durch einen Administrator gesperrt.' },
        activate: { title: 'Konto wiederhergestellt', body: 'Ihr Konto wurde wieder aktiviert.' },
        restrict_payout: {
          title: 'Auszahlungen eingeschränkt',
          body: 'Ihre Auszahlungen wurden vorübergehend eingeschränkt. Bitte kontaktieren Sie den Support.',
        },
      }
      const msg = statusMessages[body.data.action]
      notifyEvent({
        userId: id,
        pushType: 'ACCOUNT_STATUS',
        title: msg.title,
        body: msg.body,
        smsBody: `Ich habe Zeit: ${msg.title}`,
      }).catch(() => {})

      return reply.send({ user: updated })
    }
  )

  // PATCH /admin/users/:id/kyc
  app.patch(
    '/users/:id/kyc',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = kycUpdateSchemaV2.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
      }

      try {
        const updated = await updateKycStatus(id, body.data.status, request.userId, body.data.notes)

        const pushType =
          body.data.status === 'KYC_VERIFIED'
            ? 'KYC_VERIFIED'
            : body.data.status === 'KYC_REJECTED'
              ? 'KYC_REJECTED'
              : ('KYC_RESUBMISSION' as const)
        const pushTitle =
          body.data.status === 'KYC_VERIFIED'
            ? 'KYC verifiziert ✓'
            : body.data.status === 'KYC_REJECTED'
              ? 'KYC abgelehnt'
              : 'Neue Dokumente erforderlich'
        const pushBody =
          body.data.status === 'KYC_VERIFIED'
            ? 'Deine Identität wurde erfolgreich verifiziert.'
            : body.data.notes ?? 'Bitte öffne die App für weitere Informationen.'

        notifyEvent({ userId: id, pushType, title: pushTitle, body: pushBody }).catch(() => {})

        return reply.send({ user: updated })
      } catch (err: unknown) {
        return reply.status(404).send({ error: errMsg(err) })
      }
    }
  )

  // GET /admin/users/:id/kyc-documents
  app.get(
    '/users/:id/kyc-documents',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const documents = await getKycDocuments(id)
      return reply.send({ documents })
    }
  )

  // PATCH /admin/users/:id/role
  app.patch(
    '/users/:id/role',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = z.object({ role: z.enum(['CUSTOMER', 'PROVIDER'] as const) }).safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
      }

      const user = await prisma.user.findUnique({ where: { id } })
      if (!user) return reply.status(404).send({ error: 'USER_NOT_FOUND' })
      if (user.role === body.data.role) return reply.send({ user })

      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.user.update({ where: { id }, data: { role: body.data.role } })
        if (body.data.role === 'PROVIDER') {
          await tx.providerProfile.upsert({
            where: { userId: id },
            create: { userId: id, languages: ['Deutsch'] },
            update: {},
          })
        } else {
          await tx.customerProfile.upsert({
            where: { userId: id },
            create: { userId: id },
            update: {},
          })
        }
        return u
      })

      await writeAuditLog(
        request.userId,
        'USER_ROLE_CHANGED',
        'User',
        id,
        { previousRole: user.role, newRole: body.data.role },
        id
      )

      return reply.send({ user: updated })
    }
  )

  // PATCH /admin/users/:id/suspend
  app.patch(
    '/users/:id/suspend',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = z.object({ suspended: z.boolean() }).safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
      }

      const updateData = body.data.suspended
        ? { isActive: false, verificationStatus: 'SUSPENDED' as const }
        : { isActive: true, verificationStatus: 'KYC_VERIFIED' as const }

      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          displayName: true,
          profilePhotoUrl: true,
          role: true,
          verificationStatus: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
        },
      })

      await writeAuditLog(
        request.userId,
        body.data.suspended ? 'USER_SUSPEND' : 'USER_ACTIVATE',
        'User',
        id,
        { suspended: body.data.suspended },
        id
      )

      return reply.send({ user })
    }
  )

  // ── Providers ────────────────────────────────────────────────────────────

  // GET /admin/providers/kyc-queue
  app.get(
    '/providers/kyc-queue',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const query = paginationSchema.parse(request.query)

      const [total, providers] = await Promise.all([
        prisma.user.count({ where: { verificationStatus: 'KYC_PENDING', role: 'PROVIDER' } }),
        prisma.user.findMany({
          where: { verificationStatus: 'KYC_PENDING', role: 'PROVIDER' },
          include: {
            providerProfile: {
              include: {
                providerCategories: {
                  include: { category: { select: { id: true, name: true } } },
                },
              },
            },
          },
          orderBy: { updatedAt: 'asc' },
          take: query.limit,
          skip: query.offset,
        }),
      ])

      return reply.send({ total, providers })
    }
  )

  // GET /admin/providers/:userId/kyc-documents — list all uploaded docs for a provider
  app.get(
    '/providers/:userId/kyc-documents',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { userId } = request.params as { userId: string }
      const docs = await prisma.kycDocument.findMany({
        where: { userId },
        orderBy: { type: 'asc' },
      })
      return reply.send({ docs })
    },
  )

  // GET /admin/kyc/documents/:id/file — stream the raw KYC file to the admin
  app.get(
    '/kyc/documents/:id/file',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const doc = await prisma.kycDocument.findUnique({ where: { id } })
      if (!doc) return reply.status(404).send({ error: 'NOT_FOUND' })

      const absPath = path.resolve('uploads', doc.fileKey)
      if (!fs.existsSync(absPath)) return reply.status(404).send({ error: 'FILE_NOT_FOUND' })

      reply.header('Content-Type', doc.mimeType)
      reply.header('Content-Disposition', `inline; filename="${doc.fileName}"`)
      return reply.send(fs.createReadStream(absPath))
    },
  )

  // PATCH /admin/providers/:userId/kyc
  app.patch(
    '/providers/:userId/kyc',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { userId } = request.params as { userId: string }
      const body = kycUpdateSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
      }

      try {
        const updated = await updateKycStatus(
          userId,
          body.data.status,
          request.userId,
          body.data.note
        )

        // Notify provider of their KYC outcome
        const pushType =
          body.data.status === 'KYC_VERIFIED'
            ? 'KYC_VERIFIED'
            : body.data.status === 'KYC_REJECTED'
              ? 'KYC_REJECTED'
              : ('KYC_RESUBMISSION' as const)
        const pushTitle =
          body.data.status === 'KYC_VERIFIED'
            ? 'KYC verifiziert ✓'
            : body.data.status === 'KYC_REJECTED'
              ? 'KYC abgelehnt'
              : 'Neue Dokumente erforderlich'
        const pushBody =
          body.data.status === 'KYC_VERIFIED'
            ? 'Deine Identität wurde erfolgreich verifiziert.'
            : body.data.note ?? 'Bitte öffne die App für weitere Informationen.'

        notifyEvent({ userId, pushType, title: pushTitle, body: pushBody }).catch(() => {})

        return reply.send({ user: updated })
      } catch (err: unknown) {
        return reply.status(404).send({ error: errMsg(err) })
      }
    }
  )

  // GET /admin/providers/pending-category-verification — queue of docs awaiting review
  app.get(
    '/providers/pending-category-verification',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const rows = await prisma.providerCategory.findMany({
        where: { isVerified: false, verificationDocUrls: { isEmpty: false } },
        include: {
          category: { select: { id: true, name: true } },
          providerProfile: { include: { user: { select: { id: true, displayName: true, email: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      })
      return reply.send({ items: rows })
    }
  )

  // PATCH /admin/providers/:userId/categories/:categoryId/verify
  app.patch(
    '/providers/:userId/categories/:categoryId/verify',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { userId, categoryId } = request.params as { userId: string; categoryId: string }
      const body = z.object({ isVerified: z.boolean() }).safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      try {
        const { reviewCategoryVerification } = await import('../services/provider.service.js')
        const updated = await reviewCategoryVerification(userId, categoryId, body.data.isVerified, request.userId)
        return reply.send({ providerCategory: updated })
      } catch (err: unknown) {
        return reply.status(404).send({ error: errMsg(err) })
      }
    }
  )

  // PATCH /admin/providers/:userId/service-areas — admin override
  app.patch(
    '/providers/:userId/service-areas',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { userId } = request.params as { userId: string }
      const body = z
        .object({
          areas: z.array(
            z.object({
              homePlz: z.string().regex(/^\d{5}$/),
              radiusKm: z.number().int().min(1).max(200),
              plzList: z.array(z.string().regex(/^\d{5}$/)).optional(),
            })
          ),
        })
        .safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

      try {
        const { setServiceAreas } = await import('../services/provider.service.js')
        const areas = await setServiceAreas(userId, body.data.areas)
        await writeAuditLog(request.userId, 'PROVIDER_SERVICE_AREAS_UPDATED', 'ProviderProfile', userId, { areas: body.data.areas }, userId)
        return reply.send({ areas })
      } catch (err: unknown) {
        return reply.status(404).send({ error: errMsg(err) })
      }
    }
  )

  // PATCH /admin/providers/:userId/tax-info — admin override
  app.patch(
    '/providers/:userId/tax-info',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { userId } = request.params as { userId: string }
      const body = z
        .object({
          isKleinunternehmer: z.boolean(),
          legalName: z.string().min(1).max(200),
          vatNumber: z.string().optional(),
          taxId: z.string().optional(),
        })
        .safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

      try {
        const { updateTaxInfo } = await import('../services/provider.service.js')
        const profile = await updateTaxInfo(userId, body.data)
        await writeAuditLog(request.userId, 'PROVIDER_TAX_INFO_UPDATED', 'ProviderProfile', userId, body.data, userId)
        return reply.send({ profile })
      } catch (err: unknown) {
        return reply.status(404).send({ error: errMsg(err) })
      }
    }
  )

  // ── Orders ───────────────────────────────────────────────────────────────

  // GET /admin/orders
  app.get('/orders', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const query = z
      .object({
        status: z.nativeEnum(OrderStatus).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
        page: z.coerce.number().int().min(1).default(1),
      })
      .safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: query.error.flatten() })

    const where: Prisma.OrderWhereInput = {}
    if (query.data.status) where.status = query.data.status

    const offset = (query.data.page - 1) * query.data.limit

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        include: {
          customer: { select: { id: true, displayName: true, email: true } },
          offer: {
            include: {
              provider: {
                include: {
                  user: { select: { id: true, displayName: true, email: true } },
                },
              },
            },
          },
          request: {
            include: {
              category: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query.data.limit,
        skip: offset,
      }),
    ])

    const data = orders.map((o) => ({
      id: o.id,
      status: o.status,
      totalAmount: o.grossAmount,
      platformFee: o.commissionAmount,
      providerAmount: o.netProviderAmount,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      customer: {
        id: o.customer.id,
        displayName: o.customer.displayName,
        email: o.customer.email,
      },
      provider: {
        id: o.offer.provider.user.id,
        displayName: o.offer.provider.user.displayName,
        email: o.offer.provider.user.email,
      },
      request: {
        id: o.request.id,
        title: o.request.title,
        city: o.request.addressCity ?? '',
        plz: o.request.plz,
        category: o.request.category ? { name: o.request.category.name } : undefined,
      },
    }))

    return reply.send({ data, total, hasMore: offset + query.data.limit < total })
  })

  // ── Disputes ─────────────────────────────────────────────────────────────

  // GET /admin/disputes
  app.get(
    '/disputes',
    { preHandler: requireRole('ADMIN', 'HELP_DESK') },
    async (request, reply) => {
      const query = z
        .object({
          status: z
            .enum(['OPEN', 'IN_REVIEW', 'PENDING_DECISION', 'RESOLVED', 'ESCALATED'] as const)
            .optional(),
          assignedToId: z.string().uuid().optional(),
          ...paginationSchema.shape,
        })
        .parse(request.query)

      const where: Prisma.DisputeWhereInput = {}
      if (query.status) {
        where.status = query.status
      } else {
        // Default: show unresolved queue
        where.status = { in: ['OPEN', 'IN_REVIEW', 'PENDING_DECISION', 'ESCALATED'] }
      }
      if (query.assignedToId) where.assignedToId = query.assignedToId

      const offset = query.page != null ? (query.page - 1) * query.limit : query.offset

      const [total, items] = await Promise.all([
        prisma.dispute.count({ where }),
        prisma.dispute.findMany({
          where,
          include: {
            order: {
              include: {
                request: {
                  include: { category: { select: { id: true, name: true } } },
                },
                offer: {
                  include: {
                    provider: {
                      select: { id: true, user: { select: { displayName: true, email: true } } },
                    },
                  },
                },
                customer: { select: { id: true, displayName: true, email: true } },
              },
            },
          },
          orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
          take: query.limit,
          skip: offset,
        }),
      ])

      // Reshape order into the same AdminOrder shape /admin/orders returns
      // (renamed amount fields, flattened provider) so the admin panel can
      // treat dispute.order identically everywhere.
      const data = items.map((d) => ({
        ...d,
        order: {
          id: d.order.id,
          status: d.order.status,
          totalAmount: d.order.grossAmount,
          platformFee: d.order.commissionAmount,
          providerAmount: d.order.netProviderAmount,
          createdAt: d.order.createdAt,
          updatedAt: d.order.updatedAt,
          customer: d.order.customer,
          provider: {
            id: d.order.offer.provider.id,
            displayName: d.order.offer.provider.user.displayName,
            email: d.order.offer.provider.user.email,
          },
          request: {
            id: d.order.request.id,
            title: d.order.request.title,
            city: d.order.request.addressCity ?? '',
            plz: d.order.request.plz,
            category: d.order.request.category ? { name: d.order.request.category.name } : undefined,
          },
        },
      }))

      return reply.send({ data, total, hasMore: offset + query.limit < total })
    }
  )

  // GET /admin/disputes/:id
  app.get(
    '/disputes/:id',
    { preHandler: requireRole('ADMIN', 'HELP_DESK') },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const dispute = await prisma.dispute.findUnique({
        where: { id },
        include: {
          evidence: { orderBy: { createdAt: 'asc' } },
          order: {
            include: {
              request: { include: { category: true } },
              offer: {
                include: {
                  provider: {
                    include: { user: { select: { id: true, displayName: true, email: true } } },
                  },
                },
              },
              customer: { select: { id: true, displayName: true, email: true } },
              statusHistory: { orderBy: { createdAt: 'asc' } },
              chat: {
                include: {
                  messages: {
                    orderBy: { createdAt: 'asc' },
                    include: { attachments: true },
                  },
                },
              },
            },
          },
        },
      })

      if (!dispute) return reply.status(404).send({ error: 'DISPUTE_NOT_FOUND' })

      // Same AdminOrder reshape as /admin/orders and the dispute list route.
      const shaped = {
        ...dispute,
        order: {
          id: dispute.order.id,
          status: dispute.order.status,
          totalAmount: dispute.order.grossAmount,
          platformFee: dispute.order.commissionAmount,
          providerAmount: dispute.order.netProviderAmount,
          createdAt: dispute.order.createdAt,
          updatedAt: dispute.order.updatedAt,
          customer: dispute.order.customer,
          provider: {
            id: dispute.order.offer.provider.id,
            displayName: dispute.order.offer.provider.user.displayName,
            email: dispute.order.offer.provider.user.email,
          },
          request: {
            id: dispute.order.request.id,
            title: dispute.order.request.title,
            city: dispute.order.request.addressCity ?? '',
            plz: dispute.order.request.plz,
            category: dispute.order.request.category ? { name: dispute.order.request.category.name } : undefined,
          },
        },
      }

      return reply.send({ dispute: shaped })
    }
  )

  // PATCH /admin/disputes/:id/assign
  app.patch(
    '/disputes/:id/assign',
    { preHandler: requireRole('ADMIN', 'HELP_DESK') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = assignDisputeSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
      }

      const dispute = await prisma.dispute.findUnique({ where: { id } })
      if (!dispute) return reply.status(404).send({ error: 'DISPUTE_NOT_FOUND' })

      const updated = await prisma.dispute.update({
        where: { id },
        data: {
          assignedToId: body.data.assignedToId,
          status: dispute.status === 'OPEN' ? 'IN_REVIEW' : dispute.status,
          firstResponseAt: dispute.firstResponseAt ?? new Date(),
        },
      })

      await writeAuditLog(
        request.userId,
        'DISPUTE_ASSIGNED',
        'Dispute',
        id,
        { assignedToId: body.data.assignedToId }
      )
      broadcastOrderEvent(updated.orderId, { type: 'dispute_updated', disputeId: id })

      return reply.send({ dispute: updated })
    }
  )

  // PATCH /admin/disputes/:id/recommend
  app.patch(
    '/disputes/:id/recommend',
    { preHandler: requireRole('ADMIN', 'HELP_DESK') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = recommendDisputeSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
      }

      const dispute = await prisma.dispute.findUnique({ where: { id } })
      if (!dispute) return reply.status(404).send({ error: 'DISPUTE_NOT_FOUND' })
      if (dispute.status === 'RESOLVED') {
        return reply.status(400).send({ error: 'DISPUTE_ALREADY_RESOLVED' })
      }

      const updated = await prisma.dispute.update({
        where: { id },
        data: {
          recommendation: body.data.recommendation,
          internalNote: body.data.note,
          status: 'PENDING_DECISION',
        },
      })

      await writeAuditLog(
        request.userId,
        'DISPUTE_RECOMMENDATION_SET',
        'Dispute',
        id,
        { recommendation: body.data.recommendation }
      )
      broadcastOrderEvent(updated.orderId, { type: 'dispute_updated', disputeId: id })

      return reply.send({ dispute: updated })
    }
  )

  // POST /admin/disputes/:id/resolve — admin only (Help Desk can assign + recommend,
  // but the financial decision that actually moves escrow money requires ADMIN).
  app.post(
    '/disputes/:id/resolve',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = resolveDisputeSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
      }

      try {
        const dispute = await disputeService.resolveDispute({
          disputeId: id,
          resolvedByUserId: request.userId,
          ...body.data,
        })
        return reply.send({ dispute })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'ERROR'
        return reply.status(msg === 'DISPUTE_NOT_FOUND' ? 404 : 400).send({ error: msg })
      }
    }
  )

  // ── Support Tickets ──────────────────────────────────────────────────────

  // GET /admin/support-tickets
  app.get(
    '/support-tickets',
    { preHandler: requireRole('ADMIN', 'HELP_DESK') },
    async (request, reply) => {
      const query = z
        .object({
          status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const).optional(),
          assignedToId: z.string().uuid().optional(),
          ...paginationSchema.shape,
        })
        .parse(request.query)

      const where: Prisma.SupportTicketWhereInput = {}
      where.status = query.status ?? { in: ['OPEN', 'IN_PROGRESS'] }
      if (query.assignedToId) where.assignedToId = query.assignedToId

      const offset = query.page != null ? (query.page - 1) * query.limit : query.offset

      const [total, tickets] = await Promise.all([
        prisma.supportTicket.count({ where }),
        prisma.supportTicket.findMany({
          where,
          orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
          take: query.limit,
          skip: offset,
        }),
      ])

      const userIds = [...new Set(tickets.map((t) => t.userId))]
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, email: true },
      })
      const userById = new Map(users.map((u) => [u.id, u]))

      const data = tickets.map((t) => ({ ...t, user: userById.get(t.userId) ?? null }))

      return reply.send({ data, total, hasMore: offset + query.limit < total })
    }
  )

  // GET /admin/support-tickets/:id
  app.get(
    '/support-tickets/:id',
    { preHandler: requireRole('ADMIN', 'HELP_DESK') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const ticket = await prisma.supportTicket.findUnique({
        where: { id },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      })
      if (!ticket) return reply.status(404).send({ error: 'TICKET_NOT_FOUND' })

      const senderIds = [...new Set([ticket.userId, ...ticket.messages.map((m) => m.senderId)])]
      const users = await prisma.user.findMany({
        where: { id: { in: senderIds } },
        select: { id: true, displayName: true, email: true, role: true },
      })
      const userById = new Map(users.map((u) => [u.id, u]))

      return reply.send({
        ticket: {
          ...ticket,
          user: userById.get(ticket.userId) ?? null,
          messages: ticket.messages.map((m) => ({ ...m, sender: userById.get(m.senderId) ?? null })),
        },
      })
    }
  )

  // POST /admin/support-tickets/:id/messages — staff reply (can be internal)
  app.post(
    '/support-tickets/:id/messages',
    { preHandler: requireRole('ADMIN', 'HELP_DESK') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = ticketStaffMessageSchema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

      try {
        const message = await supportService.sendTicketMessage(
          id,
          request.userId,
          body.data.content,
          body.data.isInternal ?? false,
          true,
        )
        return reply.status(201).send({ message })
      } catch (err: unknown) {
        return reply.status(400).send({ error: errMsg(err) })
      }
    }
  )

  // PATCH /admin/support-tickets/:id/assign
  app.patch(
    '/support-tickets/:id/assign',
    { preHandler: requireRole('ADMIN', 'HELP_DESK') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = assignTicketSchema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

      const ticket = await prisma.supportTicket.findUnique({ where: { id } })
      if (!ticket) return reply.status(404).send({ error: 'TICKET_NOT_FOUND' })

      const updated = await prisma.supportTicket.update({
        where: { id },
        data: {
          assignedToId: body.data.assignedToId,
          status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status,
        },
      })

      await writeAuditLog(request.userId, 'SUPPORT_TICKET_ASSIGNED', 'SupportTicket', id, {
        assignedToId: body.data.assignedToId,
      })

      return reply.send({ ticket: updated })
    }
  )

  // PATCH /admin/support-tickets/:id/status
  app.patch(
    '/support-tickets/:id/status',
    { preHandler: requireRole('ADMIN', 'HELP_DESK') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = updateTicketStatusSchema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

      const ticket = await prisma.supportTicket.findUnique({ where: { id } })
      if (!ticket) return reply.status(404).send({ error: 'TICKET_NOT_FOUND' })

      const updated = await prisma.supportTicket.update({
        where: { id },
        data: { status: body.data.status },
      })

      await writeAuditLog(request.userId, 'SUPPORT_TICKET_STATUS_CHANGED', 'SupportTicket', id, {
        status: body.data.status,
      })

      return reply.send({ ticket: updated })
    }
  )

  // ── Categories ────────────────────────────────────────────────────────────

  const categoryCustomFieldSchema = z.object({
    key: z.string().min(1).max(50),
    label: z.string().min(1).max(100),
    type: z.enum(['text', 'number', 'select', 'boolean']),
    required: z.boolean().optional(),
    options: z.array(z.string()).optional(),
  })

  const categoryWriteSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    icon: z.string().optional(),
    parentId: z.string().uuid().optional(),
    commissionRate: z.number().min(0).max(1).optional(),
    geoRestrictions: z.array(z.string()).optional(),
    customFields: z.array(categoryCustomFieldSchema).optional(),
    requiredVerificationDocTypes: z.array(z.string()).optional(),
    reducedVatEligible: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })

  // GET /admin/categories
  app.get('/categories', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const categories = await prisma.category.findMany({
      include: { parent: { select: { id: true, name: true } } },
      orderBy: { sortOrder: 'asc' },
    })
    return reply.send(categories)
  })

  // POST /admin/categories
  app.post('/categories', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const body = categoryWriteSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }

    const slug = body.data.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')

    const category = await prisma.category.create({
      data: {
        name: body.data.name,
        slug,
        description: body.data.description,
        icon: body.data.icon,
        parentId: body.data.parentId,
        commissionRate: body.data.commissionRate,
        geoRestrictions: body.data.geoRestrictions ?? [],
        customFields: body.data.customFields as Prisma.InputJsonValue | undefined,
        requiredVerificationDocTypes: body.data.requiredVerificationDocTypes ?? [],
        reducedVatEligible: body.data.reducedVatEligible ?? false,
        sortOrder: body.data.sortOrder ?? 0,
      },
    })

    await writeAuditLog(request.userId, 'CATEGORY_CREATED', 'Category', category.id, {
      name: category.name,
      parentId: category.parentId,
    })

    return reply.status(201).send(category)
  })

  // PATCH /admin/categories/:id
  app.patch('/categories/:id', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = categoryWriteSchema.partial().extend({ isActive: z.boolean().optional() }).safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(body.data.name !== undefined && { name: body.data.name }),
        ...(body.data.description !== undefined && { description: body.data.description }),
        ...(body.data.icon !== undefined && { icon: body.data.icon }),
        ...(body.data.isActive !== undefined && { isActive: body.data.isActive }),
        ...(body.data.commissionRate !== undefined && { commissionRate: body.data.commissionRate }),
        ...(body.data.geoRestrictions !== undefined && { geoRestrictions: body.data.geoRestrictions }),
        ...(body.data.customFields !== undefined && {
          customFields: body.data.customFields as Prisma.InputJsonValue,
        }),
        ...(body.data.requiredVerificationDocTypes !== undefined && {
          requiredVerificationDocTypes: body.data.requiredVerificationDocTypes,
        }),
        ...(body.data.reducedVatEligible !== undefined && { reducedVatEligible: body.data.reducedVatEligible }),
        ...(body.data.sortOrder !== undefined && { sortOrder: body.data.sortOrder }),
      },
    })

    await writeAuditLog(request.userId, 'CATEGORY_UPDATED', 'Category', category.id, body.data)

    return reply.send(category)
  })

  // DELETE /admin/categories/:id — soft-delete
  app.delete('/categories/:id', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.category.update({ where: { id }, data: { isActive: false } })
    await writeAuditLog(request.userId, 'CATEGORY_DEACTIVATED', 'Category', id)
    return reply.send({ message: 'Category deactivated' })
  })

  // ── Commission rules (original routes kept for backward compat) ───────────

  // GET /admin/commission-rules
  app.get(
    '/commission-rules',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const rules = await prisma.commissionRule.findMany({
        where: { isActive: true },
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
      return reply.send({ rules })
    }
  )

  // POST /admin/commission-rules
  app.post(
    '/commission-rules',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const body = commissionRuleSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
      }

      const rule = await prisma.commissionRule.create({
        data: {
          categoryId: body.data.categoryId,
          cityCode: body.data.cityCode,
          rate: body.data.rate,
          minimumAmount: body.data.minimumAmount ?? 1.0,
          isGlobal: body.data.isGlobal ?? false,
          createdById: request.userId,
        },
        include: { category: { select: { id: true, name: true } } },
      })

      await writeAuditLog(request.userId, 'COMMISSION_RULE_CREATED', 'CommissionRule', rule.id, {
        rate: rule.rate,
        categoryId: rule.categoryId,
        cityCode: rule.cityCode,
        isGlobal: rule.isGlobal,
      })

      return reply.status(201).send({ rule })
    }
  )

  // PATCH /admin/commission-rules/:id
  app.patch(
    '/commission-rules/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = commissionRuleSchema.partial().safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
      }

      const existing = await prisma.commissionRule.findUnique({ where: { id } })
      if (!existing) return reply.status(404).send({ error: 'RULE_NOT_FOUND' })

      const rule = await prisma.commissionRule.update({
        where: { id },
        data: body.data,
        include: { category: { select: { id: true, name: true } } },
      })

      await writeAuditLog(request.userId, 'COMMISSION_RULE_UPDATED', 'CommissionRule', id, {
        changes: body.data,
      })

      return reply.send({ rule })
    }
  )

  // DELETE /admin/commission-rules/:id — soft-deactivate
  app.delete(
    '/commission-rules/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const existing = await prisma.commissionRule.findUnique({ where: { id } })
      if (!existing) return reply.status(404).send({ error: 'RULE_NOT_FOUND' })

      await prisma.commissionRule.update({ where: { id }, data: { isActive: false } })

      await writeAuditLog(request.userId, 'COMMISSION_RULE_DEACTIVATED', 'CommissionRule', id)

      return reply.send({ message: 'Rule deactivated' })
    }
  )

  // ── Commission rates (frontend-facing aliases with scope mapping) ──────────

  // GET /admin/commission-rates
  app.get('/commission-rates', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const rules = await prisma.commissionRule.findMany({
      where: { isActive: true },
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(rules.map(mapCommissionRule))
  })

  // POST /admin/commission-rates
  app.post('/commission-rates', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const body = commissionRateInputSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }

    const { scope, rate, categoryId, city } = body.data
    const rule = await prisma.commissionRule.create({
      data: {
        rate,
        isGlobal: scope === 'GLOBAL',
        categoryId: scope === 'CATEGORY' ? categoryId : undefined,
        cityCode: scope === 'CITY' ? city : undefined,
        minimumAmount: 1.0,
        createdById: request.userId,
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
    })

    await writeAuditLog(request.userId, 'COMMISSION_RULE_CREATED', 'CommissionRule', rule.id, {
      rate: rule.rate,
      scope,
    })

    return reply.status(201).send(mapCommissionRule(rule))
  })

  // PATCH /admin/commission-rates/:id
  app.patch(
    '/commission-rates/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = z.object({ rate: z.number().min(0).max(1) }).safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
      }

      const existing = await prisma.commissionRule.findUnique({ where: { id } })
      if (!existing) return reply.status(404).send({ error: 'RULE_NOT_FOUND' })

      const rule = await prisma.commissionRule.update({
        where: { id },
        data: { rate: body.data.rate },
        include: { category: { select: { id: true, name: true, slug: true } } },
      })

      await writeAuditLog(request.userId, 'COMMISSION_RULE_UPDATED', 'CommissionRule', id, {
        rate: body.data.rate,
      })

      return reply.send(mapCommissionRule(rule))
    }
  )

  // DELETE /admin/commission-rates/:id
  app.delete(
    '/commission-rates/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const existing = await prisma.commissionRule.findUnique({ where: { id } })
      if (!existing) return reply.status(404).send({ error: 'RULE_NOT_FOUND' })

      await prisma.commissionRule.update({ where: { id }, data: { isActive: false } })

      await writeAuditLog(request.userId, 'COMMISSION_RULE_DEACTIVATED', 'CommissionRule', id)

      return reply.send({ message: 'Commission rate deactivated' })
    }
  )

  // ── Legal docs ────────────────────────────────────────────────────────────

  // GET /admin/legal-docs
  app.get('/legal-docs', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const docs = await prisma.legalDocument.findMany({ where: { isActive: true } })
    const data = docs.map((d) => ({
      id: d.id,
      type: legalTypeMap[d.type] ?? d.type.toUpperCase(),
      content: d.content,
      updatedAt: d.createdAt,
    }))
    return reply.send(data)
  })

  // PATCH /admin/legal-docs/:type
  app.patch('/legal-docs/:type', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { type } = request.params as { type: string }
    const body = z.object({ content: z.string().min(1) }).safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }

    const backendType = legalReverseTypeMap[type] ?? type.toLowerCase()

    const existing = await prisma.legalDocument.findFirst({
      where: { type: backendType },
      orderBy: { createdAt: 'desc' },
    })
    if (!existing) return reply.status(404).send({ error: 'LEGAL_DOC_NOT_FOUND' })

    const updated = await prisma.legalDocument.update({
      where: { id: existing.id },
      data: { content: body.data.content },
    })

    await writeAuditLog(request.userId, 'LEGAL_DOCUMENT_UPDATED', 'LegalDocument', updated.id, {
      type: updated.type,
    })

    return reply.send({
      id: updated.id,
      type: legalTypeMap[updated.type] ?? updated.type.toUpperCase(),
      content: updated.content,
      updatedAt: updated.createdAt,
    })
  })

  // ── Reports ───────────────────────────────────────────────────────────────

  // GET /admin/stats
  app.get('/stats', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [
      totalUsers,
      totalProviders,
      totalCustomers,
      totalOrders,
      activeOrders,
      totalRevenueResult,
      openDisputes,
      newUsersThisWeek,
      newOrdersThisWeek,
      revenueThisMonthResult,
      dailyGmvResult,
      kycQueueSize,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'PROVIDER' } }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.order.count(),
      prisma.order.count({
        where: { status: { in: ['IN_PROGRESS', 'AWAITING_RELEASE', 'COMPLETED_BY_PROVIDER'] } },
      }),
      prisma.order.aggregate({
        where: { status: { in: ['RELEASED', 'REFUNDED', 'PARTIALLY_RELEASED'] } },
        _sum: { grossAmount: true },
      }),
      prisma.dispute.count({
        where: { status: { in: ['OPEN', 'IN_REVIEW', 'PENDING_DECISION', 'ESCALATED'] } },
      }),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.order.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.order.aggregate({
        where: { status: 'RELEASED', createdAt: { gte: startOfMonth } },
        _sum: { commissionAmount: true },
      }),
      prisma.order.aggregate({
        where: { status: { in: ['RELEASED', 'REFUNDED', 'PARTIALLY_RELEASED'] }, updatedAt: { gte: startOfToday } },
        _sum: { grossAmount: true },
      }),
      prisma.user.count({ where: { verificationStatus: { in: ['KYC_PENDING', 'KYC_RESUBMISSION'] } } }),
    ])

    return reply.send({
      totalUsers,
      totalProviders,
      totalCustomers,
      totalOrders,
      activeOrders,
      totalRevenue: totalRevenueResult._sum?.grossAmount ?? 0,
      openDisputes,
      newUsersThisWeek,
      newOrdersThisWeek,
      revenueThisMonth: revenueThisMonthResult._sum?.commissionAmount ?? 0,
      dailyGmv: dailyGmvResult._sum?.grossAmount ?? 0,
      kycQueueSize,
    })
  })

  // GET /admin/reports — category/city performance, dispute & conversion rates
  app.get('/reports', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const query = z
      .object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
      .safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    const from = query.data.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const to = query.data.to ?? new Date()
    const completedStatuses: OrderStatus[] = ['RELEASED', 'REFUNDED', 'PARTIALLY_RELEASED']

    const [orders, requests, disputes, providers, kycDocs] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
          id: true,
          status: true,
          grossAmount: true,
          commissionAmount: true,
          autoReleased: true,
          createdAt: true,
          request: { select: { category: { select: { id: true, name: true } }, addressCity: true, plz: true } },
        },
      }),
      prisma.serviceRequest.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.dispute.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.user.count({ where: { role: 'PROVIDER' } }),
      prisma.kycDocument.findMany({
        where: { reviewedAt: { not: null }, createdAt: { gte: from, lte: to } },
        select: { createdAt: true, reviewedAt: true },
      }),
    ])

    const completedOrders = orders.filter((o) => completedStatuses.includes(o.status))
    const totalGmv = completedOrders.reduce((sum, o) => sum + o.grossAmount, 0)
    const totalCommission = completedOrders.reduce((sum, o) => sum + o.commissionAmount, 0)
    const autoReleasedCount = completedOrders.filter((o) => o.autoReleased).length

    const categoryMap = new Map<string, { name: string; gmv: number; orders: number; disputes: number }>()
    const cityMap = new Map<string, { gmv: number; orders: number }>()

    for (const o of completedOrders) {
      const cat = o.request.category
      if (cat) {
        const entry = categoryMap.get(cat.id) ?? { name: cat.name, gmv: 0, orders: 0, disputes: 0 }
        entry.gmv += o.grossAmount
        entry.orders += 1
        categoryMap.set(cat.id, entry)
      }
      const city = o.request.addressCity ?? o.request.plz?.slice(0, 2)
      if (city) {
        const entry = cityMap.get(city) ?? { gmv: 0, orders: 0 }
        entry.gmv += o.grossAmount
        entry.orders += 1
        cityMap.set(city, entry)
      }
    }

    const activatedProviders = await prisma.user.count({
      where: { role: 'PROVIDER', verificationStatus: 'KYC_VERIFIED' },
    })

    const kycQueueTimesMs = kycDocs
      .filter((d) => d.reviewedAt)
      .map((d) => d.reviewedAt!.getTime() - d.createdAt.getTime())
    const avgKycQueueHours =
      kycQueueTimesMs.length > 0
        ? kycQueueTimesMs.reduce((a, b) => a + b, 0) / kycQueueTimesMs.length / (1000 * 60 * 60)
        : 0

    return reply.send({
      period: { from, to },
      gmv: totalGmv,
      platformRevenue: totalCommission,
      orderVolume: orders.length,
      completedOrderVolume: completedOrders.length,
      averageOrderValue: completedOrders.length > 0 ? totalGmv / completedOrders.length : 0,
      conversionRate: requests > 0 ? completedOrders.length / requests : 0,
      disputeRate: completedOrders.length > 0 ? disputes / completedOrders.length : 0,
      autoReleaseRate: completedOrders.length > 0 ? autoReleasedCount / completedOrders.length : 0,
      providerActivationRate: providers > 0 ? activatedProviders / providers : 0,
      avgKycQueueHours,
      categoryPerformance: [...categoryMap.entries()].map(([id, v]) => ({ categoryId: id, ...v })),
      cityPerformance: [...cityMap.entries()].map(([city, v]) => ({ city, ...v })),
    })
  })

  // GET /admin/transactions — real-time payment/payout monitor
  app.get('/transactions', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const query = z
      .object({
        status: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    const where: Prisma.OrderWhereInput = query.data.status
      ? { status: query.data.status as OrderStatus }
      : {}

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          grossAmount: true,
          commissionAmount: true,
          netProviderAmount: true,
          releasedAmount: true,
          refundedAmount: true,
          mangopayPayInId: true,
          mangopayTransferId: true,
          mangopayPayOutId: true,
          createdAt: true,
          updatedAt: true,
          customer: { select: { id: true, displayName: true, email: true } },
          offer: { select: { provider: { select: { user: { select: { id: true, displayName: true } } } } } },
        },
        orderBy: { updatedAt: 'desc' },
        take: query.data.limit,
        skip: query.data.offset,
      }),
    ])

    const fraudSignals = await moderationService.getFraudSignals()

    return reply.send({
      total,
      transactions: orders.map((o) => ({
        id: o.id,
        status: o.status,
        paymentStatus: o.paymentStatus,
        grossAmount: o.grossAmount,
        commissionAmount: o.commissionAmount,
        netProviderAmount: o.netProviderAmount,
        releasedAmount: o.releasedAmount,
        refundedAmount: o.refundedAmount,
        stripePaymentIntentId: o.mangopayPayInId,
        stripeTransferId: o.mangopayTransferId,
        stripePayoutId: o.mangopayPayOutId,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        customer: o.customer,
        provider: o.offer.provider.user,
        isFlaggedForFraud: fraudSignals.repeatedFailedPaymentUserIds.includes(o.customer.id),
      })),
      fraudSignals,
    })
  })

  // ── Moderation: provider blacklist ──────────────────────────────────────────

  app.get('/moderation/blacklist', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    return reply.send({ entries: await moderationService.listBlacklist() })
  })

  app.post('/moderation/blacklist', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const body = z
      .object({
        identifierType: z.enum(['EMAIL', 'PHONE', 'DEVICE_ID', 'DOCUMENT_HASH']),
        identifierValue: z.string().min(1),
        reason: z.string().min(3),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    try {
      const entry = await moderationService.addToBlacklist(
        body.data.identifierType as BlacklistIdentifierType,
        body.data.identifierValue,
        body.data.reason,
        request.userId
      )
      await writeAuditLog(request.userId, 'PROVIDER_BLACKLISTED', 'ProviderBlacklist', entry.id, body.data)
      return reply.status(201).send({ entry })
    } catch {
      return reply.status(409).send({ error: 'ALREADY_BLACKLISTED' })
    }
  })

  app.delete('/moderation/blacklist/:id', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await moderationService.removeFromBlacklist(id)
    await writeAuditLog(request.userId, 'BLACKLIST_ENTRY_REMOVED', 'ProviderBlacklist', id)
    return reply.send({ message: 'Removed' })
  })

  // ── Moderation: IP/device bans ──────────────────────────────────────────────

  app.get('/moderation/bans', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    return reply.send({ bans: await moderationService.listBans() })
  })

  app.post('/moderation/bans', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const body = z
      .object({
        type: z.enum(['IP', 'DEVICE']),
        value: z.string().min(1),
        reason: z.string().min(3),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    try {
      const ban = await moderationService.addBan(
        body.data.type as BanType,
        body.data.value,
        body.data.reason,
        request.userId
      )
      await writeAuditLog(request.userId, 'ENTITY_BANNED', 'BannedEntity', ban.id, body.data)
      return reply.status(201).send({ ban })
    } catch {
      return reply.status(409).send({ error: 'ALREADY_BANNED' })
    }
  })

  app.delete('/moderation/bans/:id', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await moderationService.removeBan(id)
    await writeAuditLog(request.userId, 'BAN_REMOVED', 'BannedEntity', id)
    return reply.send({ message: 'Removed' })
  })

  // ── Moderation: content review queue ────────────────────────────────────────

  app.get('/moderation/content', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const query = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() }).safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
    return reply.send({ items: await moderationService.listModerationQueue(query.data.status) })
  })

  app.patch('/moderation/content/:id', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z
      .object({ status: z.enum(['APPROVED', 'REJECTED']), reviewNote: z.string().optional() })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    try {
      const updated = await moderationService.reviewContent(id, body.data.status, request.userId, body.data.reviewNote)
      await writeAuditLog(request.userId, `CONTENT_${body.data.status}`, 'FlaggedContent', id)
      return reply.send({ item: updated })
    } catch (err: unknown) {
      return reply.status(404).send({ error: errMsg(err) })
    }
  })

  // ── Platform settings (admin-configurable, no deploy required) ─────────────

  const SETTING_KEYS = [
    'otp_expires_in_minutes',
    'otp_max_retries',
    'default_release_window_hours',
    'kyc_document_types',
    'feature_flags',
  ] as const

  app.get('/settings', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const rows = await prisma.platformSetting.findMany()
    const byKey = new Map(rows.map((r) => [r.key, r.value]))

    const { env } = await import('../config/env.js')
    const defaults: Record<string, unknown> = {
      otp_expires_in_minutes: env.OTP_EXPIRES_IN_MINUTES,
      otp_max_retries: env.OTP_MAX_RETRIES,
      default_release_window_hours: env.DEFAULT_RELEASE_WINDOW_HOURS,
      kyc_document_types: ['ID_FRONT', 'ID_BACK', 'SELFIE_WITH_ID'],
      feature_flags: {},
    }

    return reply.send({
      settings: SETTING_KEYS.map((key) => ({
        key,
        value: byKey.has(key) ? byKey.get(key) : defaults[key],
        isOverridden: byKey.has(key),
      })),
    })
  })

  app.patch('/settings/:key', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { key } = request.params as { key: string }
    if (!SETTING_KEYS.includes(key as (typeof SETTING_KEYS)[number])) {
      return reply.status(400).send({ error: 'UNKNOWN_SETTING' })
    }

    const body = z.object({ value: z.unknown() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    const setting = await prisma.platformSetting.upsert({
      where: { key },
      create: { key, value: body.data.value as Prisma.InputJsonValue, updatedById: request.userId },
      update: { value: body.data.value as Prisma.InputJsonValue, updatedById: request.userId },
    })

    await writeAuditLog(request.userId, 'PLATFORM_SETTING_UPDATED', 'PlatformSetting', key, { value: body.data.value })

    return reply.send({ setting })
  })

  // ── Audit log ─────────────────────────────────────────────────────────────

  // GET /admin/audit-logs
  app.get('/audit-logs', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const query = z
      .object({
        userId: z.string().uuid().optional(),
        actionType: z.string().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        ...paginationSchema.shape,
      })
      .parse(request.query)

    const where: Prisma.AuditLogWhereInput = {}
    if (query.userId) where.userId = query.userId
    if (query.actionType) where.actionType = { contains: query.actionType, mode: 'insensitive' }
    if (query.from ?? query.to) {
      where.createdAt = {
        ...(query.from && { gte: query.from }),
        ...(query.to && { lte: query.to }),
      }
    }

    const offset = query.page != null ? (query.page - 1) * query.limit : query.offset

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, displayName: true, email: true, role: true } },
          targetUser: { select: { id: true, displayName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: offset,
      }),
    ])

    return reply.send({ total, logs })
  })
}
