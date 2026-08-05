import { prisma } from '../config/prisma.js'
import type { Prisma } from '@prisma/client'

// ─── Invoice number generation ────────────────────────────────────────────────
// Format: IHZ-{YYYY}-{000001}
// Sequence derived from existing invoice count for the year.
// Note: relies on @unique constraint to surface conflicts under concurrent load.

async function nextInvoiceNumbers(
  tx: Prisma.TransactionClient,
  count: number
): Promise<string[]> {
  const year = new Date().getFullYear()
  const prefix = `IHZ-${year}-`
  const existing = await tx.invoice.count({
    where: { invoiceNumber: { startsWith: prefix } },
  })
  return Array.from({ length: count }, (_, i) =>
    `${prefix}${String(existing + i + 1).padStart(6, '0')}`
  )
}

// ─── Generate invoices for order ──────────────────────────────────────────────

export async function generateInvoicesForOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      offer: { include: { provider: true } },
      request: { include: { customer: { include: { user: true } }, category: true } },
    },
  })

  if (!order) throw new Error('ORDER_NOT_FOUND')

  // A full refund means no consideration was retained on either side — nothing to invoice.
  if (order.status === 'REFUNDED') return null

  const releasedStatuses = ['RELEASED', 'PARTIALLY_RELEASED']
  if (!releasedStatuses.includes(order.status)) throw new Error('ORDER_NOT_RELEASED')
  if (!order.completedAt) throw new Error('ORDER_NOT_COMPLETED')

  const existing = await prisma.invoice.count({ where: { orderId } })
  if (existing > 0) throw new Error('INVOICES_ALREADY_GENERATED')

  const provider = order.offer.provider
  const providerUserId = provider.userId
  const customerUserId = order.customerId
  const serviceDate = order.completedAt

  // On a partial release, only the amount actually retained (gross minus what
  // was refunded back to the customer) is a billable service — scale both
  // invoices down proportionally rather than billing the full original gross.
  const retainedFraction =
    order.status === 'PARTIALLY_RELEASED' && order.grossAmount > 0
      ? (order.grossAmount - (order.refundedAmount ?? 0)) / order.grossAmount
      : 1

  // SERVICE_INVOICE — provider → customer
  // §19 UStG (Kleinunternehmer) → 0%; §12 UStG reduced-rate categories → 7%; else standard 19%
  const serviceVatRate = provider.isKleinunternehmer ? 0 : order.request.category?.reducedVatEligible ? 0.07 : 0.19
  const serviceSubtotal = Math.round(order.grossAmount * retainedFraction * 100) / 100
  const serviceVatAmount = Math.round(serviceSubtotal * serviceVatRate * 100) / 100
  const serviceTotalAmount = serviceSubtotal + serviceVatAmount

  // COMMISSION_INVOICE — platform → provider
  const commissionVatRate = 0.19
  const commissionSubtotal = Math.round(order.commissionAmount * retainedFraction * 100) / 100
  const commissionVatAmount = Math.round(commissionSubtotal * commissionVatRate * 100) / 100
  const commissionTotalAmount = commissionSubtotal + commissionVatAmount

  return prisma.$transaction(async (tx) => {
    const [serviceNumber, commissionNumber] = await nextInvoiceNumbers(tx, 2)

    const serviceInvoice = await tx.invoice.create({
      data: {
        invoiceNumber: serviceNumber,
        invoiceType: 'SERVICE_INVOICE',
        orderId,
        issuerId: providerUserId,
        receiverId: customerUserId,
        serviceDate,
        subtotalAmount: serviceSubtotal,
        vatRate: serviceVatRate,
        vatAmount: serviceVatAmount,
        totalAmount: serviceTotalAmount,
      },
    })

    const commissionInvoice = await tx.invoice.create({
      data: {
        invoiceNumber: commissionNumber,
        invoiceType: 'COMMISSION_INVOICE',
        orderId,
        issuerId: 'platform',
        receiverId: providerUserId,
        serviceDate,
        subtotalAmount: commissionSubtotal,
        vatRate: commissionVatRate,
        vatAmount: commissionVatAmount,
        totalAmount: commissionTotalAmount,
      },
    })

    return { serviceInvoice, commissionInvoice }
  })
}

// ─── Get invoices for order ───────────────────────────────────────────────────

export async function getInvoicesForOrder(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { offer: { include: { provider: true } } },
  })
  if (!order) throw new Error('ORDER_NOT_FOUND')

  const isCustomer = order.customerId === userId
  const isProvider = order.offer.provider.userId === userId
  if (!isCustomer && !isProvider) throw new Error('FORBIDDEN')

  return prisma.invoice.findMany({
    where: { orderId },
    orderBy: { createdAt: 'asc' },
  })
}

// ─── Kleinunternehmer threshold (§19 UStG — currently EUR 22,000/year) ────────

const KLEINUNTERNEHMER_THRESHOLD = 22000

export async function getKleinunternehmerStatus(providerUserId: string) {
  const provider = await prisma.providerProfile.findUnique({ where: { userId: providerUserId } })
  if (!provider) throw new Error('PROFILE_NOT_FOUND')

  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const result = await prisma.invoice.aggregate({
    where: {
      issuerId: providerUserId,
      invoiceType: 'SERVICE_INVOICE',
      issueDate: { gte: yearStart },
    },
    _sum: { subtotalAmount: true },
  })

  const revenue = result._sum.subtotalAmount ?? 0

  return {
    isKleinunternehmer: provider.isKleinunternehmer,
    revenueThisYear: revenue,
    threshold: KLEINUNTERNEHMER_THRESHOLD,
    approachingThreshold: provider.isKleinunternehmer && revenue >= KLEINUNTERNEHMER_THRESHOLD * 0.8,
    exceededThreshold: provider.isKleinunternehmer && revenue >= KLEINUNTERNEHMER_THRESHOLD,
  }
}

// ─── Get invoice archive for user ─────────────────────────────────────────────

export async function getInvoiceArchive(userId: string) {
  return prisma.invoice.findMany({
    where: {
      OR: [{ issuerId: userId }, { receiverId: userId }],
    },
    include: {
      order: {
        select: {
          id: true,
          status: true,
          grossAmount: true,
          request: {
            select: {
              category: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}
