import { prisma } from '../config/prisma.js'
import type { DisputeOutcome } from '@prisma/client'
import {
  releaseOrderPayment,
  refundOrderPayment,
  partialReleaseOrderPayment,
} from './stripe.service.js'

export async function openDispute(data: {
  orderId: string
  openedByUserId: string
  reasonCategory: string
  description: string
}) {
  const order = await prisma.order.findUnique({
    where: { id: data.orderId },
    include: { offer: { include: { provider: true } }, dispute: true },
  })
  if (!order) throw new Error('ORDER_NOT_FOUND')

  const isCustomer = order.customerId === data.openedByUserId
  const isProvider = order.offer.provider.userId === data.openedByUserId
  if (!isCustomer && !isProvider) throw new Error('FORBIDDEN')

  if (order.dispute) throw new Error('DISPUTE_ALREADY_OPEN')

  if (!['AWAITING_RELEASE', 'IN_PROGRESS'].includes(order.status)) {
    throw new Error('DISPUTE_WINDOW_CLOSED')
  }

  if (data.description.length < 50) {
    throw new Error('DESCRIPTION_TOO_SHORT')
  }

  return prisma.$transaction(async (tx) => {
    const dispute = await tx.dispute.create({
      data: {
        orderId: data.orderId,
        openedById: data.openedByUserId,
        reasonCategory: data.reasonCategory,
        description: data.description,
        status: 'OPEN',
      },
    })

    await tx.order.update({
      where: { id: data.orderId },
      data: { status: 'DISPUTED' },
    })

    await tx.orderStatusHistory.create({
      data: { orderId: data.orderId, status: 'DISPUTED', triggeredBy: data.openedByUserId },
    })

    await tx.serviceRequest.update({
      where: { id: order.requestId },
      data: { status: 'DISPUTED' },
    })

    // Freeze escrow wallet — TODO: call Mangopay wallet freeze API
    const chat = await tx.chat.findUnique({ where: { orderId: data.orderId } })
    if (chat) {
      await tx.chatMessage.create({
        data: {
          chatId: chat.id,
          senderId: 'system',
          content: 'Ein Streitfall wurde eröffnet. Die Zahlung wurde eingefroren, bis eine Entscheidung getroffen wurde.',
          isSystem: true,
        },
      })
    }

    return dispute
  })
}

// Bank-initiated chargeback — not a user action, so it skips the normal
// window/description validations that gate openDispute(). Idempotent: a
// second chargeback event for the same order is a no-op.
export async function openDisputeFromChargeback(orderId: string, stripeDisputeId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { dispute: true },
  })
  if (!order) throw new Error('ORDER_NOT_FOUND')
  if (order.dispute) return order.dispute
  if (['CANCELLED', 'REFUNDED'].includes(order.status)) return null

  return prisma.$transaction(async (tx) => {
    const dispute = await tx.dispute.create({
      data: {
        orderId,
        openedById: order.customerId,
        reasonCategory: 'CHARGEBACK',
        description: `Automatisch erstellt: Kunde hat eine Rückbuchung (Chargeback) über seine Bank eingeleitet. Stripe Dispute ID: ${stripeDisputeId}.`,
        status: 'OPEN',
      },
    })

    await tx.order.update({ where: { id: orderId }, data: { status: 'DISPUTED' } })

    await tx.orderStatusHistory.create({
      data: { orderId, status: 'DISPUTED', triggeredBy: 'system:stripe_chargeback' },
    })

    await tx.serviceRequest.update({
      where: { id: order.requestId },
      data: { status: 'DISPUTED' },
    })

    const chat = await tx.chat.findUnique({ where: { orderId } })
    if (chat) {
      await tx.chatMessage.create({
        data: {
          chatId: chat.id,
          senderId: 'system',
          content: 'Der Kunde hat eine Rückbuchung über seine Bank eingeleitet. Die Zahlung wurde eingefroren, bis eine Entscheidung getroffen wurde.',
          isSystem: true,
        },
      })
    }

    return dispute
  })
}

export async function addEvidence(data: {
  disputeId: string
  uploadedByUserId: string
  side: 'customer' | 'provider'
  files: Array<{ fileUrl: string; fileName: string; fileType: string; fileSizeBytes: number }>
}) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: data.disputeId },
    include: { order: { include: { offer: { include: { provider: true } } } } },
  })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')

  const isCustomer = dispute.order.customerId === data.uploadedByUserId
  const isProvider = dispute.order.offer.provider.userId === data.uploadedByUserId
  if (!isCustomer && !isProvider) throw new Error('FORBIDDEN')

  // Check existing evidence count (max 10 per side)
  const existing = await prisma.disputeEvidence.count({
    where: { disputeId: data.disputeId, side: data.side },
  })
  if (existing + data.files.length > 10) throw new Error('EVIDENCE_LIMIT_EXCEEDED')

  return prisma.disputeEvidence.createMany({
    data: data.files.map((f) => ({
      disputeId: data.disputeId,
      side: data.side,
      uploadedById: data.uploadedByUserId,
      fileUrl: f.fileUrl,
      fileName: f.fileName,
      fileType: f.fileType,
      fileSizeBytes: f.fileSizeBytes,
    })),
  })
}

export async function resolveDispute(data: {
  disputeId: string
  resolvedByUserId: string
  outcome: DisputeOutcome
  resolutionNote: string
  releasedAmount?: number
}) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: data.disputeId },
    include: { order: true },
  })
  if (!dispute) throw new Error('DISPUTE_NOT_FOUND')
  if (dispute.status === 'RESOLVED') throw new Error('ALREADY_RESOLVED')

  const order = dispute.order

  // REWORK_AGREEMENT and ESCALATED take no financial action — handle first
  // and return before touching Stripe or computing amounts.
  if (data.outcome === 'REWORK_AGREEMENT' || data.outcome === 'ESCALATED') {
    return prisma.$transaction(async (tx) => {
      await tx.dispute.update({
        where: { id: data.disputeId },
        data: {
          status: 'RESOLVED',
          outcome: data.outcome,
          resolvedById: data.resolvedByUserId,
          resolvedAt: new Date(),
          resolutionNote: data.resolutionNote,
        },
      })

      if (data.outcome === 'REWORK_AGREEMENT') {
        await tx.order.update({ where: { id: order.id }, data: { status: 'IN_PROGRESS' } })
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, status: 'IN_PROGRESS', triggeredBy: data.resolvedByUserId },
        })
      }

      await tx.auditLog.create({
        data: {
          userId: data.resolvedByUserId,
          actionType: 'DISPUTE_RESOLVED',
          targetEntity: 'Dispute',
          targetId: data.disputeId,
          metadata: { outcome: data.outcome },
        },
      })

      return dispute
    })
  }

  // The remaining outcomes move real money — call Stripe first so a failed
  // charge/transfer/refund never gets silently recorded as if it succeeded.
  let newOrderStatus: 'RELEASED' | 'REFUNDED' | 'PARTIALLY_RELEASED'
  let releasedAmount: number
  let refundedAmount: number
  let transferId: string | undefined
  let payoutRefId: string | undefined

  switch (data.outcome) {
    case 'FULL_RELEASE': {
      newOrderStatus = 'RELEASED'
      releasedAmount = order.netProviderAmount
      refundedAmount = 0
      const result = await releaseOrderPayment(order.id)
      transferId = result.transferId
      break
    }
    case 'FULL_REFUND': {
      newOrderStatus = 'REFUNDED'
      releasedAmount = 0
      refundedAmount = order.grossAmount
      const result = await refundOrderPayment(order.id)
      payoutRefId = result.refundId
      break
    }
    case 'PARTIAL_RELEASE': {
      newOrderStatus = 'PARTIALLY_RELEASED'
      releasedAmount = data.releasedAmount ?? order.netProviderAmount / 2
      refundedAmount = order.grossAmount - releasedAmount
      const result = await partialReleaseOrderPayment(order.id, releasedAmount)
      transferId = result.transferId
      payoutRefId = result.refundId
      break
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.dispute.update({
      where: { id: data.disputeId },
      data: {
        status: 'RESOLVED',
        outcome: data.outcome,
        resolvedById: data.resolvedByUserId,
        resolvedAt: new Date(),
        resolutionNote: data.resolutionNote,
      },
    })

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: newOrderStatus,
        releasedAt: new Date(),
        paymentStatus: data.outcome === 'FULL_REFUND' ? 'REFUNDED' : 'RELEASED',
        releasedAmount,
        refundedAmount,
        ...(transferId ? { mangopayTransferId: transferId } : {}),
        ...(payoutRefId ? { mangopayPayOutId: payoutRefId } : {}),
      },
    })

    await tx.orderStatusHistory.create({
      data: { orderId: order.id, status: newOrderStatus, triggeredBy: data.resolvedByUserId },
    })

    await tx.auditLog.create({
      data: {
        userId: data.resolvedByUserId,
        actionType: 'DISPUTE_RESOLVED',
        targetEntity: 'Dispute',
        targetId: data.disputeId,
        metadata: { outcome: data.outcome, releasedAmount, refundedAmount },
      },
    })

    const chat = await tx.chat.findUnique({ where: { orderId: order.id } })
    if (chat) {
      await tx.chatMessage.create({
        data: {
          chatId: chat.id,
          senderId: 'system',
          content: `Der Streitfall wurde entschieden: ${data.outcome.replace(/_/g, ' ')}.`,
          isSystem: true,
        },
      })
    }

    return dispute
  })
}

export async function getDisputeById(disputeId: string, userId: string) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      evidence: true,
      order: {
        include: {
          offer: { include: { provider: { include: { user: { select: { id: true, displayName: true } } } } } },
          request: { include: { category: true } },
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
  })

  if (!dispute) throw new Error('NOT_FOUND')

  const isCustomer = dispute.order.customerId === userId
  const isProvider = dispute.order.offer.provider.userId === userId
  if (!isCustomer && !isProvider) throw new Error('FORBIDDEN')

  return dispute
}

export async function listDisputeQueue(assignedToId?: string, limit = 20, offset = 0) {
  const where: Record<string, unknown> = {
    status: { in: ['OPEN', 'IN_REVIEW', 'PENDING_DECISION'] },
  }
  if (assignedToId) where.assignedToId = assignedToId

  const [total, items] = await Promise.all([
    prisma.dispute.count({ where }),
    prisma.dispute.findMany({
      where,
      include: {
        order: {
          include: {
            request: { include: { category: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: limit,
      skip: offset,
    }),
  ])

  return { total, items }
}
