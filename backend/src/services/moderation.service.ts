import { prisma } from '../config/prisma.js'
import type { BlacklistIdentifierType, BanType, ModerationContentType } from '@prisma/client'

// ─── Bans & blacklist checks (called at registration & login) ────────────────

export async function checkDuplicateRegistration(data: {
  email: string
  phone: string
  deviceId?: string
  ip?: string
}) {
  // Hard blocks — banned IP/device
  if (data.ip) {
    const bannedIp = await prisma.bannedEntity.findUnique({
      where: { type_value: { type: 'IP', value: data.ip } },
    })
    if (bannedIp) throw new Error('IP_BANNED')
  }
  if (data.deviceId) {
    const bannedDevice = await prisma.bannedEntity.findUnique({
      where: { type_value: { type: 'DEVICE', value: data.deviceId } },
    })
    if (bannedDevice) throw new Error('DEVICE_BANNED')
  }

  // Hard blocks — blacklisted identity (prevents re-registration after removal)
  const blacklistChecks: Array<{ type: BlacklistIdentifierType; value: string }> = [
    { type: 'EMAIL', value: data.email },
    { type: 'PHONE', value: data.phone },
  ]
  if (data.deviceId) blacklistChecks.push({ type: 'DEVICE_ID', value: data.deviceId })

  for (const check of blacklistChecks) {
    const hit = await prisma.providerBlacklist.findUnique({
      where: { identifierType_identifierValue: { identifierType: check.type, identifierValue: check.value } },
    })
    if (hit) throw new Error('BLACKLISTED')
  }

  // Soft signal — same device/IP already tied to another account. Not blocking,
  // just logged so Admin can review clusters of accounts sharing a fingerprint.
  if (data.deviceId) {
    const sameDevice = await prisma.user.count({ where: { registrationDeviceId: data.deviceId } })
    if (sameDevice > 0) {
      await prisma.auditLog.create({
        data: {
          actionType: 'DUPLICATE_DEVICE_REGISTRATION_DETECTED',
          targetEntity: 'User',
          metadata: { deviceId: data.deviceId, email: data.email, existingAccounts: sameDevice },
        },
      })
    }
  }
  if (data.ip) {
    const sameIp = await prisma.user.count({ where: { registrationIp: data.ip } })
    if (sameIp >= 3) {
      await prisma.auditLog.create({
        data: {
          actionType: 'DUPLICATE_IP_REGISTRATION_DETECTED',
          targetEntity: 'User',
          metadata: { ip: data.ip, email: data.email, existingAccounts: sameIp },
        },
      })
    }
  }
}

export async function checkLoginAllowed(ip?: string, deviceId?: string) {
  if (ip) {
    const bannedIp = await prisma.bannedEntity.findUnique({
      where: { type_value: { type: 'IP', value: ip } },
    })
    if (bannedIp) throw new Error('IP_BANNED')
  }
  if (deviceId) {
    const bannedDevice = await prisma.bannedEntity.findUnique({
      where: { type_value: { type: 'DEVICE', value: deviceId } },
    })
    if (bannedDevice) throw new Error('DEVICE_BANNED')
  }
}

// ─── Consent records (GDPR Art. 7) ────────────────────────────────────────────

export async function recordConsent(userId: string, consentType: string, version: string, ipAddress: string, userAgent?: string) {
  return prisma.consentRecord.create({
    data: { userId, consentType, version, ipAddress, userAgent },
  })
}

// ─── Admin: blacklist management ──────────────────────────────────────────────

export async function listBlacklist() {
  return prisma.providerBlacklist.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function addToBlacklist(
  identifierType: BlacklistIdentifierType,
  identifierValue: string,
  reason: string,
  createdById: string
) {
  return prisma.providerBlacklist.create({
    data: { identifierType, identifierValue, reason, createdById },
  })
}

export async function removeFromBlacklist(id: string) {
  await prisma.providerBlacklist.delete({ where: { id } })
}

// ─── Admin: IP/device bans ─────────────────────────────────────────────────────

export async function listBans() {
  return prisma.bannedEntity.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function addBan(type: BanType, value: string, reason: string, createdById: string) {
  return prisma.bannedEntity.create({ data: { type, value, reason, createdById } })
}

export async function removeBan(id: string) {
  await prisma.bannedEntity.delete({ where: { id } })
}

// ─── Content moderation queue ─────────────────────────────────────────────────

export async function flagContentForModeration(
  contentType: ModerationContentType,
  contentUrl: string,
  ownerId: string
) {
  return prisma.flaggedContent.create({ data: { contentType, contentUrl, ownerId } })
}

export async function listModerationQueue(status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
  return prisma.flaggedContent.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
}

export async function reviewContent(
  id: string,
  status: 'APPROVED' | 'REJECTED',
  reviewedById: string,
  reviewNote?: string
) {
  const content = await prisma.flaggedContent.findUnique({ where: { id } })
  if (!content) throw new Error('NOT_FOUND')

  const updated = await prisma.flaggedContent.update({
    where: { id },
    data: { status, reviewedById, reviewedAt: new Date(), reviewNote },
  })

  // On rejection, strip the URL from wherever it's actually displayed
  if (status === 'REJECTED') {
    await removeRejectedContent(content.contentType, content.contentUrl, content.ownerId)
  }

  return updated
}

async function removeRejectedContent(contentType: ModerationContentType, url: string, ownerId: string) {
  switch (contentType) {
    case 'PROFILE_PHOTO': {
      const user = await prisma.user.findUnique({ where: { id: ownerId } })
      if (user?.profilePhotoUrl === url) {
        await prisma.user.update({ where: { id: ownerId }, data: { profilePhotoUrl: null } })
      }
      break
    }
    case 'SERVICE_PHOTO': {
      const profile = await prisma.providerProfile.findUnique({ where: { userId: ownerId } })
      if (profile) {
        await prisma.providerProfile.update({
          where: { userId: ownerId },
          data: { servicePhotoUrls: profile.servicePhotoUrls.filter((u) => u !== url) },
        })
      }
      break
    }
    case 'REQUEST_PHOTO': {
      const requests = await prisma.serviceRequest.findMany({
        where: { customer: { userId: ownerId }, photoUrls: { has: url } },
      })
      for (const req of requests) {
        await prisma.serviceRequest.update({
          where: { id: req.id },
          data: { photoUrls: req.photoUrls.filter((u) => u !== url) },
        })
      }
      break
    }
    case 'COMPLETION_PHOTO': {
      const orders = await prisma.order.findMany({
        where: { customerId: ownerId, completionPhotoUrls: { has: url } },
      })
      for (const order of orders) {
        await prisma.order.update({
          where: { id: order.id },
          data: { completionPhotoUrls: order.completionPhotoUrls.filter((u) => u !== url) },
        })
      }
      break
    }
  }
}

// ─── Fraud pattern flags (surfaced on admin dashboard) ────────────────────────

export async function getFraudSignals() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [failedPayments, recentDisputes] = await Promise.all([
    prisma.auditLog.groupBy({
      by: ['targetUserId'],
      where: { actionType: 'PAYMENT_FAILED', createdAt: { gte: since }, targetUserId: { not: null } },
      _count: { targetUserId: true },
    }),
    prisma.dispute.findMany({
      where: { createdAt: { gte: since } },
      select: { order: { select: { offer: { select: { providerId: true } } } } },
    }),
  ])

  const disputeCountByProvider = new Map<string, number>()
  for (const d of recentDisputes) {
    const providerId = d.order.offer.providerId
    disputeCountByProvider.set(providerId, (disputeCountByProvider.get(providerId) ?? 0) + 1)
  }

  return {
    repeatedFailedPaymentUserIds: failedPayments
      .filter((r) => r._count.targetUserId >= 3)
      .map((r) => r.targetUserId)
      .filter((id): id is string => !!id),
    highDisputeProviderIds: [...disputeCountByProvider.entries()]
      .filter(([, count]) => count >= 2)
      .map(([providerId]) => providerId),
  }
}
