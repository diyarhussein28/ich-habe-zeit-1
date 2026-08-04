import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '../config/prisma.js'
import type { OrderStatus } from '@prisma/client'

const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['AWAITING_PAYMENT', 'IN_PROGRESS', 'AWAITING_RELEASE', 'DISPUTED']

// ─── Right of Access (Art. 15) / Right to Portability (Art. 20) ───────────────

export async function exportUserData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      customerProfile: true,
      providerProfile: true,
      addresses: true,
      consentRecords: true,
      notificationSettings: true,
      kycDocuments: {
        select: { id: true, type: true, status: true, fileName: true, createdAt: true, reviewedAt: true },
      },
      customerOrders: {
        include: { offer: true, request: true },
      },
    },
  })
  if (!user) throw new Error('USER_NOT_FOUND')

  const providerOrders = user.providerProfile
    ? await prisma.order.findMany({
        where: { offer: { providerId: user.providerProfile.id } },
        include: { offer: true, request: true },
      })
    : []

  const raterFilter = [
    user.customerProfile ? { customerRaterId: user.customerProfile.id } : null,
    user.providerProfile ? { providerRaterId: user.providerProfile.id } : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null)

  const receiverFilter = [
    user.customerProfile ? { customerReceiverId: user.customerProfile.id } : null,
    user.providerProfile ? { providerReceiverId: user.providerProfile.id } : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null)

  const ratingsGiven = raterFilter.length
    ? await prisma.rating.findMany({ where: { OR: raterFilter } })
    : []

  const ratingsReceived = receiverFilter.length
    ? await prisma.rating.findMany({ where: { OR: receiverFilter } })
    : []

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      displayName: user.displayName,
      role: user.role,
      dateOfBirth: user.dateOfBirth,
      createdAt: user.createdAt,
    },
    customerProfile: user.customerProfile,
    providerProfile: user.providerProfile,
    addresses: user.addresses,
    consentRecords: user.consentRecords,
    notificationSettings: user.notificationSettings,
    kycDocuments: user.kycDocuments,
    ordersAsCustomer: user.customerOrders,
    ordersAsProvider: providerOrders,
    ratingsGiven,
    ratingsReceived,
  }
}

// ─── Right to Erasure (Art. 17) ────────────────────────────────────────────────
//
// Personal identifiers (email, phone, name, DOB, photo, password) are scrubbed
// and login is disabled. Orders, invoices, chat messages, and ratings are kept
// intact — German tax law requires financial records for 10 years (§ 147 AO),
// and the same order/dispute data needs to survive for chat/dispute retention.
// Known limitation: invoice PDFs render the party's *current* displayName
// live rather than a snapshot taken at issue time, so an already-issued
// invoice re-rendered after deletion will show "Gelöschter Nutzer" instead of
// the original name. Fixing that needs invoices to snapshot the name at
// generation time — a separate, larger change than this account-deletion flow.
export async function deleteUserAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { customerProfile: true, providerProfile: true, kycDocuments: true },
  })
  if (!user) throw new Error('USER_NOT_FOUND')

  const activeOrderWhere = user.providerProfile
    ? { OR: [{ customerId: userId }, { offer: { providerId: user.providerProfile.id } }] }
    : { customerId: userId }

  const activeOrderCount = await prisma.order.count({
    where: { ...activeOrderWhere, status: { in: ACTIVE_ORDER_STATUSES } },
  })
  if (activeOrderCount > 0) throw new Error('ACTIVE_ORDERS_EXIST')

  // Delete KYC document files from disk before dropping the DB records
  for (const doc of user.kycDocuments) {
    try {
      await fs.unlink(path.resolve('uploads', doc.fileKey))
    } catch {}
  }

  await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    await tx.kycDocument.deleteMany({ where: { userId } })
    await tx.address.deleteMany({ where: { userId } })
    await tx.pushToken.deleteMany({ where: { userId } })

    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.ichhabezeit.de`,
        phone: `deleted-${userId}`,
        displayName: 'Gelöschter Nutzer',
        profilePhotoUrl: null,
        dateOfBirth: null,
        passwordHash: `deleted:${userId}:${Date.now()}`,
        isActive: false,
        mfaEnabled: false,
        mfaSecret: null,
      },
    })
  })

  return { deleted: true }
}
