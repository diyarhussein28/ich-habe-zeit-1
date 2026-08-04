import { prisma } from '../config/prisma.js'
import type { OrderStatus, UrgencyFlag, BroadcastType, Prisma } from '@prisma/client'

export interface CreateRequestInput {
  customerId: string
  categoryId: string
  title: string
  description: string
  plz: string
  addressStreet?: string
  addressCity?: string
  lat?: number
  lon?: number
  preferredDateStart: Date
  preferredDateEnd?: Date
  budgetMin?: number
  budgetMax?: number
  budgetType?: string
  materialsIncluded?: string
  urgency?: UrgencyFlag
  broadcastType?: BroadcastType
  directProviderId?: string
  customFieldValues?: Record<string, unknown>
  photoUrls?: string[]
}

export async function createRequest(input: CreateRequestInput) {
  const customerProfile = await prisma.customerProfile.upsert({
    where: { userId: input.customerId },
    create: { userId: input.customerId },
    update: {},
  })

  const category = await prisma.category.findUnique({ where: { id: input.categoryId } })
  if (!category || !category.isActive) throw new Error('CATEGORY_NOT_FOUND')

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7 days to receive offers

  return prisma.serviceRequest.create({
    data: {
      customerId: customerProfile.id,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      plz: input.plz,
      addressStreet: input.addressStreet,
      addressCity: input.addressCity,
      lat: input.lat,
      lon: input.lon,
      preferredDateStart: input.preferredDateStart,
      preferredDateEnd: input.preferredDateEnd,
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      budgetType: input.budgetType ?? 'range',
      materialsIncluded: input.materialsIncluded ?? 'to_be_discussed',
      urgency: input.urgency ?? 'NORMAL',
      broadcastType: input.broadcastType ?? 'OPEN',
      directProviderId: input.directProviderId,
      customFieldValues: input.customFieldValues as Prisma.InputJsonValue | undefined,
      photoUrls: input.photoUrls ?? [],
      status: 'DRAFT',
      expiresAt,
    },
    include: { category: true },
  })
}

export async function publishRequest(requestId: string, customerId: string) {
  const request = await prisma.serviceRequest.findFirst({
    where: { id: requestId, customer: { userId: customerId } },
  })
  if (!request) throw new Error('NOT_FOUND')
  if (request.status !== 'DRAFT') throw new Error('INVALID_STATE')

  return prisma.serviceRequest.update({
    where: { id: requestId },
    data: { status: 'OPEN' },
    include: { category: true },
  })
}

export async function getRequestById(id: string) {
  return prisma.serviceRequest.findUnique({
    where: { id },
    include: {
      category: true,
      offers: {
        where: { status: 'PENDING' },
        include: {
          provider: {
            include: { user: { select: { id: true, displayName: true, profilePhotoUrl: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
}

export interface ListRequestsFilter {
  categoryId?: string
  plz?: string
  radiusKm?: number
  status?: OrderStatus
  customerId?: string
  urgency?: UrgencyFlag
  budgetMax?: number
  limit?: number
  offset?: number
}

export async function listRequests(filter: ListRequestsFilter = {}) {
  const where: Record<string, unknown> = {}

  if (filter.categoryId) where.categoryId = filter.categoryId
  if (filter.status) where.status = filter.status
  if (filter.urgency) where.urgency = filter.urgency
  if (filter.plz) where.plz = { startsWith: filter.plz.substring(0, 2) }
  if (filter.customerId) {
    where.customer = { userId: filter.customerId }
  }
  if (filter.budgetMax) {
    where.budgetMax = { lte: filter.budgetMax }
  }

  const [total, items] = await Promise.all([
    prisma.serviceRequest.count({ where }),
    prisma.serviceRequest.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, slug: true, icon: true } },
        _count: { select: { offers: true } },
      },
      orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }],
      take: filter.limit ?? 20,
      skip: filter.offset ?? 0,
    }),
  ])

  return { total, items }
}

export async function listProviderFeed(providerUserId: string, limit = 20, offset = 0) {
  const provider = await prisma.providerProfile.findUnique({
    where: { userId: providerUserId },
    include: {
      serviceAreas: true,
      providerCategories: { select: { categoryId: true } },
    },
  })
  if (!provider) throw new Error('PROVIDER_NOT_FOUND')

  const categoryIds = provider.providerCategories.map((pc) => pc.categoryId)
  const plzPrefixes = provider.serviceAreas.flatMap((sa) =>
    sa.plzList.length > 0 ? sa.plzList.map((p) => p.substring(0, 2)) : [sa.homePlz.substring(0, 2)]
  )

  const where: Record<string, unknown> = {
    status: { in: ['OPEN', 'OFFER_RECEIVED'] },
    expiresAt: { gt: new Date() },
    customer: { userId: { not: providerUserId } },
  }

  if (categoryIds.length > 0) {
    where.categoryId = { in: categoryIds }
  }

  if (plzPrefixes.length > 0) {
    where.OR = plzPrefixes.map((prefix) => ({ plz: { startsWith: prefix } }))
  }

  const [total, items] = await Promise.all([
    prisma.serviceRequest.count({ where }),
    prisma.serviceRequest.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, slug: true, icon: true } },
        customer: { include: { user: { select: { displayName: true, profilePhotoUrl: true } } } },
        _count: { select: { offers: true } },
        offers: {
          where: { providerId: provider.id },
          select: { id: true, status: true, proposedPrice: true },
          take: 1,
        },
      },
      orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
    }),
  ])

  const itemsWithFlag = items.map((item) => ({
    ...item,
    myOffer: item.offers[0] ?? null,
    offers: undefined,
  }))

  return { total, items: itemsWithFlag }
}

// ─── Auto-expire ──────────────────────────────────────────────────────────────

export async function expireOldRequests() {
  const result = await prisma.serviceRequest.updateMany({
    where: {
      status: 'OPEN',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  })

  return { expired: result.count }
}

export async function cancelRequest(requestId: string, userId: string) {
  const request = await prisma.serviceRequest.findFirst({
    where: { id: requestId, customer: { userId } },
  })
  if (!request) throw new Error('NOT_FOUND')
  if (!['DRAFT', 'OPEN', 'OFFER_RECEIVED'].includes(request.status)) {
    throw new Error('CANNOT_CANCEL_AT_THIS_STAGE')
  }

  return prisma.serviceRequest.update({
    where: { id: requestId },
    data: { status: 'CANCELLED' },
  })
}
