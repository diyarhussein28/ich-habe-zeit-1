import { prisma } from '../config/prisma.js'
import type { Prisma } from '@prisma/client'

export interface CreateOfferInput {
  requestId: string
  providerUserId: string
  proposedPrice: number
  pricingBreakdown?: Record<string, unknown>
  proposedDate: Date
  estimatedDurationHours?: number
  scopeOfWork: string
  exclusions?: string
  materialsHandling?: string
  validHours?: number
  personalMessage?: string
}

export async function createOffer(input: CreateOfferInput) {
  const provider = await prisma.providerProfile.findUnique({
    where: { userId: input.providerUserId },
    include: { user: { select: { verificationStatus: true } } },
  })
  if (!provider) throw new Error('PROVIDER_NOT_FOUND')

  if (provider.user.verificationStatus === 'SUSPENDED') throw new Error('ACCOUNT_SUSPENDED')

  const request = await prisma.serviceRequest.findUnique({
    where: { id: input.requestId },
    include: { category: true },
  })
  if (!request) throw new Error('REQUEST_NOT_FOUND')
  if (!['OPEN', 'OFFER_RECEIVED'].includes(request.status)) {
    throw new Error('REQUEST_NOT_OPEN')
  }
  if (request.expiresAt && request.expiresAt < new Date()) {
    throw new Error('REQUEST_EXPIRED')
  }

  // Category-specific verification requirement (e.g. electrical licence)
  if (request.category.requiredVerificationDocTypes.length > 0) {
    const providerCategory = await prisma.providerCategory.findUnique({
      where: { providerProfileId_categoryId: { providerProfileId: provider.id, categoryId: request.categoryId } },
    })
    if (!providerCategory?.isVerified) {
      throw new Error('CATEGORY_VERIFICATION_REQUIRED')
    }
  }

  // Provider can't offer on their own request (shouldn't happen but guard it)
  if (request.directProviderId && request.directProviderId !== provider.id) {
    throw new Error('DIRECT_INVITE_ONLY')
  }

  // One offer per provider per request
  const existing = await prisma.offer.findFirst({
    where: { requestId: input.requestId, providerId: provider.id, status: 'PENDING' },
  })
  if (existing) throw new Error('OFFER_ALREADY_SUBMITTED')

  const validUntil = new Date()
  validUntil.setHours(validUntil.getHours() + (input.validHours ?? 48))

  const offer = await prisma.offer.create({
    data: {
      requestId: input.requestId,
      providerId: provider.id,
      proposedPrice: input.proposedPrice,
      pricingBreakdown: input.pricingBreakdown as Prisma.InputJsonValue | undefined,
      proposedDate: input.proposedDate,
      estimatedDurationHours: input.estimatedDurationHours,
      scopeOfWork: input.scopeOfWork,
      exclusions: input.exclusions,
      materialsHandling: input.materialsHandling ?? 'included',
      validUntil,
      personalMessage: input.personalMessage,
    },
    include: {
      provider: {
        include: {
          user: { select: { id: true, displayName: true, profilePhotoUrl: true } },
        },
      },
    },
  })

  // Move request to OFFER_RECEIVED if still OPEN
  if (request.status === 'OPEN') {
    await prisma.serviceRequest.update({
      where: { id: input.requestId },
      data: { status: 'OFFER_RECEIVED' },
    })
  }

  return offer
}

export async function getOffersForRequest(requestId: string, customerUserId: string) {
  const request = await prisma.serviceRequest.findFirst({
    where: { id: requestId, customer: { userId: customerUserId } },
  })
  if (!request) throw new Error('NOT_FOUND')

  return prisma.offer.findMany({
    where: { requestId, status: { in: ['PENDING', 'ACCEPTED'] } },
    include: {
      provider: {
        include: {
          user: { select: { id: true, displayName: true, profilePhotoUrl: true } },
          serviceAreas: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function getOfferById(offerId: string) {
  return prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      provider: {
        include: { user: { select: { id: true, displayName: true, profilePhotoUrl: true } } },
      },
      request: { include: { category: true } },
    },
  })
}

export async function withdrawOffer(offerId: string, providerUserId: string) {
  const offer = await prisma.offer.findFirst({
    where: { id: offerId, provider: { userId: providerUserId }, status: 'PENDING' },
  })
  if (!offer) throw new Error('NOT_FOUND')

  return prisma.offer.update({ where: { id: offerId }, data: { status: 'WITHDRAWN' } })
}

// Customer declines a pending offer outright (no counter-suggestion).
export async function rejectOffer(offerId: string, customerUserId: string) {
  const offer = await prisma.offer.findFirst({
    where: { id: offerId, status: 'PENDING', request: { customer: { userId: customerUserId } } },
    include: { provider: true, request: true },
  })
  if (!offer) throw new Error('NOT_FOUND')

  const updated = await prisma.offer.update({ where: { id: offerId }, data: { status: 'REJECTED' } })

  // If this was the only/last pending offer, the request goes back to OPEN so other providers can still bid
  const remainingPending = await prisma.offer.count({ where: { requestId: offer.requestId, status: 'PENDING' } })
  if (remainingPending === 0 && offer.request.status === 'OFFER_RECEIVED') {
    await prisma.serviceRequest.update({ where: { id: offer.requestId }, data: { status: 'OPEN' } })
  }

  return { offer: updated, providerUserId: offer.provider.userId, requestTitle: offer.request.title }
}

// Customer declines the offer but suggests a different price, inviting the
// provider to submit a fresh offer. No negotiation thread is modeled — this
// simply rejects the current offer and notifies the provider of the ask.
export async function counterOffer(
  offerId: string,
  customerUserId: string,
  counterPrice: number,
  message?: string
) {
  const offer = await prisma.offer.findFirst({
    where: { id: offerId, status: 'PENDING', request: { customer: { userId: customerUserId } } },
    include: { provider: true, request: true },
  })
  if (!offer) throw new Error('NOT_FOUND')
  if (counterPrice <= 0) throw new Error('INVALID_PRICE')

  const updated = await prisma.offer.update({ where: { id: offerId }, data: { status: 'REJECTED' } })

  const remainingPending = await prisma.offer.count({ where: { requestId: offer.requestId, status: 'PENDING' } })
  if (remainingPending === 0 && offer.request.status === 'OFFER_RECEIVED') {
    await prisma.serviceRequest.update({ where: { id: offer.requestId }, data: { status: 'OPEN' } })
  }

  return {
    offer: updated,
    providerUserId: offer.provider.userId,
    requestId: offer.requestId,
    requestTitle: offer.request.title,
    counterPrice,
    message,
  }
}

export async function getProviderOffers(providerUserId: string, status?: string) {
  const provider = await prisma.providerProfile.findUnique({ where: { userId: providerUserId } })
  if (!provider) throw new Error('PROVIDER_NOT_FOUND')

  return prisma.offer.findMany({
    where: {
      providerId: provider.id,
      ...(status ? { status: status as 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED' } : {}),
    },
    include: {
      request: {
        include: {
          category: { select: { id: true, name: true, slug: true } },
          customer: { include: { user: { select: { displayName: true, profilePhotoUrl: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}
