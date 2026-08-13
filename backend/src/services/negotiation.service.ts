import { prisma } from '../config/prisma.js'
import type { Prisma } from '@prisma/client'
import { notifyEvent } from './notification.service.js'

// ─── In-chat offer negotiation ────────────────────────────────────────────────
// Fiverr-style: an offer is a structured message inside the (request, provider)
// chat thread. Either party can propose; the other can accept, decline, or
// counter. A counter marks the previous offer COUNTERED and creates a new one
// linked to it, so the whole negotiation reads as a chain in the transcript.

export interface ProposeOfferInput {
  requestId: string
  providerId: string
  proposedByUserId: string
  proposedPrice: number
  scopeOfWork: string
  /** Working days the provider needs once started. Surfaced as "Lieferzeit". */
  estimatedDurationDays?: number
  proposedDate?: Date
  validHours?: number
  /** Set when this offer supersedes another (a counter). */
  parentOfferId?: string
}

async function authorize(requestId: string, providerId: string, userId: string) {
  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    include: { customer: true },
  })
  if (!request) throw new Error('REQUEST_NOT_FOUND')

  const provider = await prisma.providerProfile.findUnique({ where: { id: providerId } })
  if (!provider) throw new Error('PROVIDER_NOT_FOUND')

  const isCustomer = request.customer.userId === userId
  const isProvider = provider.userId === userId
  if (!isCustomer && !isProvider) throw new Error('FORBIDDEN')

  return { request, provider, isCustomer, isProvider }
}

async function getOrCreateChat(requestId: string, providerId: string) {
  const existing = await prisma.chat.findUnique({
    where: { requestId_providerId: { requestId, providerId } },
  })
  if (existing) return existing
  return prisma.chat.create({ data: { requestId, providerId } })
}

const OFFER_INCLUDE = {
  provider: { include: { user: { select: { id: true, displayName: true, profilePhotoUrl: true } } } },
  request: { include: { customer: { include: { user: { select: { id: true, displayName: true } } } } } },
} satisfies Prisma.OfferInclude

/**
 * Creates an offer and posts it into the chat as an OFFER message.
 * Used for both the first proposal and every counter.
 */
export async function proposeOffer(input: ProposeOfferInput) {
  const { request, provider, isCustomer } = await authorize(
    input.requestId,
    input.providerId,
    input.proposedByUserId,
  )

  if (input.proposedPrice <= 0) throw new Error('INVALID_PRICE')
  if (!['OPEN', 'OFFER_RECEIVED'].includes(request.status)) throw new Error('REQUEST_NOT_OPEN')

  // A counter must target a live offer in this same negotiation, and must come
  // from the side that didn't make it — you can't counter your own offer.
  if (input.parentOfferId) {
    const parent = await prisma.offer.findUnique({ where: { id: input.parentOfferId } })
    if (!parent || parent.requestId !== input.requestId || parent.providerId !== input.providerId) {
      throw new Error('PARENT_OFFER_NOT_FOUND')
    }
    if (parent.status !== 'PENDING') throw new Error('PARENT_OFFER_NOT_PENDING')
    if (parent.proposedByUserId === input.proposedByUserId) throw new Error('CANNOT_COUNTER_OWN_OFFER')
  }

  const validUntil = new Date()
  validUntil.setHours(validUntil.getHours() + (input.validHours ?? 72))

  const proposedDate = input.proposedDate ?? new Date(Date.now() + 24 * 60 * 60 * 1000)

  // Resolved before the transaction: getOrCreateChat runs on the base client,
  // so calling it inside would escape the transaction and leave an orphan chat
  // behind if the offer creation rolled back.
  const chat = await getOrCreateChat(input.requestId, input.providerId)

  const result = await prisma.$transaction(async (tx) => {
    if (input.parentOfferId) {
      await tx.offer.update({
        where: { id: input.parentOfferId },
        data: { status: 'COUNTERED' },
      })
    }

    const offer = await tx.offer.create({
      data: {
        requestId: input.requestId,
        providerId: input.providerId,
        proposedByUserId: input.proposedByUserId,
        parentOfferId: input.parentOfferId,
        proposedPrice: input.proposedPrice,
        scopeOfWork: input.scopeOfWork,
        proposedDate,
        estimatedDurationHours: input.estimatedDurationDays
          ? input.estimatedDurationDays * 8
          : undefined,
        validUntil,
      },
      include: OFFER_INCLUDE,
    })

    const message = await tx.chatMessage.create({
      data: {
        chatId: chat.id,
        senderId: input.proposedByUserId,
        messageType: 'OFFER',
        offerId: offer.id,
        content: input.parentOfferId
          ? `Gegenangebot: ${input.proposedPrice.toFixed(2)} €`
          : `Angebot: ${input.proposedPrice.toFixed(2)} €`,
      },
    })

    // Only a provider's offer moves the request into OFFER_RECEIVED — a
    // customer's price suggestion isn't an offer the request can be awarded on.
    if (!isCustomer && request.status === 'OPEN') {
      await tx.serviceRequest.update({
        where: { id: input.requestId },
        data: { status: 'OFFER_RECEIVED' },
      })
    }

    return { offer, message }
  })

  const recipientId = isCustomer ? provider.userId : request.customer.userId
  notifyEvent({
    userId: recipientId,
    pushType: 'NEW_OFFER',
    requestId: input.requestId,
    providerId: input.providerId,
    title: input.parentOfferId ? 'Neues Gegenangebot' : 'Neues Angebot',
    body: `${input.proposedPrice.toFixed(2)} € — ${input.scopeOfWork.slice(0, 80)}`,
    category: 'newOffer',
  }).catch(() => {})

  return result
}

/** Declines a pending offer. Either party can decline the other's proposal. */
export async function declineOffer(offerId: string, userId: string) {
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, include: OFFER_INCLUDE })
  if (!offer) throw new Error('OFFER_NOT_FOUND')
  if (offer.status !== 'PENDING') throw new Error('OFFER_NOT_PENDING')

  const { isCustomer } = await authorize(offer.requestId, offer.providerId, userId)
  if (offer.proposedByUserId === userId) throw new Error('CANNOT_DECLINE_OWN_OFFER')

  const chat = await getOrCreateChat(offer.requestId, offer.providerId)

  await prisma.$transaction(async (tx) => {
    await tx.offer.update({ where: { id: offerId }, data: { status: 'REJECTED' } })
    await tx.chatMessage.create({
      data: {
        chatId: chat.id,
        senderId: userId,
        messageType: 'SYSTEM',
        isSystem: true,
        content: 'Angebot abgelehnt.',
      },
    })

    // Nothing pending left → the request re-opens so other providers can bid.
    const remaining = await tx.offer.count({
      where: { requestId: offer.requestId, status: 'PENDING' },
    })
    if (remaining === 0) {
      const req = await tx.serviceRequest.findUnique({ where: { id: offer.requestId } })
      if (req?.status === 'OFFER_RECEIVED') {
        await tx.serviceRequest.update({
          where: { id: offer.requestId },
          data: { status: 'OPEN' },
        })
      }
    }
  })

  const recipientId = isCustomer ? offer.provider.userId : offer.request.customer.userId
  notifyEvent({
    userId: recipientId,
    pushType: 'NEW_REQUEST_MESSAGE',
    requestId: offer.requestId,
    providerId: offer.providerId,
    title: 'Angebot abgelehnt',
    body: `Dein Angebot über ${offer.proposedPrice.toFixed(2)} € wurde abgelehnt.`,
    skipEmail: true,
  }).catch(() => {})

  return { declined: true }
}

/** Withdraws an offer you proposed yourself. */
export async function withdrawOwnOffer(offerId: string, userId: string) {
  const offer = await prisma.offer.findUnique({ where: { id: offerId } })
  if (!offer) throw new Error('OFFER_NOT_FOUND')
  if (offer.status !== 'PENDING') throw new Error('OFFER_NOT_PENDING')
  if (offer.proposedByUserId !== userId) throw new Error('FORBIDDEN')

  await authorize(offer.requestId, offer.providerId, userId)
  const chat = await getOrCreateChat(offer.requestId, offer.providerId)

  await prisma.$transaction(async (tx) => {
    await tx.offer.update({ where: { id: offerId }, data: { status: 'WITHDRAWN' } })
    await tx.chatMessage.create({
      data: {
        chatId: chat.id,
        senderId: userId,
        messageType: 'SYSTEM',
        isSystem: true,
        content: 'Angebot zurückgezogen.',
      },
    })
  })

  return { withdrawn: true }
}

/**
 * Full negotiation transcript for a (request, provider) pair: chat messages
 * with each OFFER message's linked offer resolved to its *current* status.
 */
export async function getNegotiation(requestId: string, providerId: string, userId: string) {
  const { isCustomer } = await authorize(requestId, providerId, userId)
  const chat = await getOrCreateChat(requestId, providerId)

  const messages = await prisma.chatMessage.findMany({
    where: { chatId: chat.id },
    include: {
      attachments: true,
      offer: {
        select: {
          id: true,
          status: true,
          proposedPrice: true,
          scopeOfWork: true,
          proposedDate: true,
          estimatedDurationHours: true,
          validUntil: true,
          proposedByUserId: true,
          parentOfferId: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })

  const activeOffer = await prisma.offer.findFirst({
    where: { requestId, providerId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  })

  return { chatId: chat.id, messages, activeOffer, viewerIsCustomer: isCustomer }
}
