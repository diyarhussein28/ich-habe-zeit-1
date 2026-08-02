import fs from 'node:fs'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { requireRole } from '../middleware/auth.middleware.js'
import { updateKycStatus } from '../services/provider.service.js'
import { sendPushToUser } from '../services/push.service.js'

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCommissionRule(rule: any) {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updated = await updateKycStatus(id, body.data.status as any, request.userId, body.data.notes)

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

        sendPushToUser(id, { type: pushType }, pushTitle, pushBody).catch(() => {})

        return reply.send({ user: updated })
      } catch (err: unknown) {
        return reply.status(404).send({ error: errMsg(err) })
      }
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

        sendPushToUser(userId, { type: pushType }, pushTitle, pushBody).catch(() => {})

        return reply.send({ user: updated })
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
        status: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(request.query)

    const where: Prisma.OrderWhereInput = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (query.status) where.status = query.status as any

    const offset = (query.page - 1) * query.limit

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
        take: query.limit,
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

    return reply.send({ data, total, hasMore: offset + query.limit < total })
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
                      select: { id: true, user: { select: { displayName: true } } },
                    },
                  },
                },
                customer: { select: { id: true, displayName: true } },
              },
            },
          },
          orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
          take: query.limit,
          skip: offset,
        }),
      ])

      return reply.send({ data: items, total, hasMore: offset + query.limit < total })
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
      return reply.send({ dispute })
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

      return reply.send({ dispute: updated })
    }
  )

  // ── Categories ────────────────────────────────────────────────────────────

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
    const body = z
      .object({
        name: z.string().min(1),
        description: z.string().optional(),
        icon: z.string().optional(),
        parentId: z.string().uuid().optional(),
      })
      .safeParse(request.body)
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
        iconUrl: body.data.icon,
        parentId: body.data.parentId,
      },
    })
    return reply.status(201).send(category)
  })

  // PATCH /admin/categories/:id
  app.patch('/categories/:id', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
        isActive: z.boolean().optional(),
      })
      .safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(body.data.name !== undefined && { name: body.data.name }),
        ...(body.data.description !== undefined && { description: body.data.description }),
        ...(body.data.icon !== undefined && { iconUrl: body.data.icon }),
        ...(body.data.isActive !== undefined && { isActive: body.data.isActive }),
      },
    })
    return reply.send(category)
  })

  // DELETE /admin/categories/:id — soft-delete
  app.delete('/categories/:id', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.category.update({ where: { id }, data: { isActive: false } })
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
    })
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
