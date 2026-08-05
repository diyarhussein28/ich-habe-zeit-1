import { prisma } from '../config/prisma.js'
import type { Prisma, PricingModel } from '@prisma/client'

// ─── Get provider profile (own) ───────────────────────────────────────────────

export async function getProviderProfile(userId: string) {
  const profile = await prisma.providerProfile.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          profilePhotoUrl: true,
          email: true,
          emailVerified: true,
          phone: true,
          phoneVerified: true,
          verificationStatus: true,
          createdAt: true,
        },
      },
      serviceAreas: { orderBy: { createdAt: 'asc' } },
      providerCategories: {
        include: {
          category: { select: { id: true, name: true, slug: true, icon: true } },
        },
      },
    },
  })

  if (!profile) throw new Error('PROFILE_NOT_FOUND')
  return profile
}

// ─── Update provider profile ──────────────────────────────────────────────────

export async function updateProviderProfile(
  userId: string,
  data: {
    bio?: string
    servicePhotoUrls?: string[]
    pricingModel?: PricingModel
    languages?: string[]
    workingHours?: Record<string, unknown>
    isAvailable?: boolean
  }
) {
  const existing = await prisma.providerProfile.findUnique({ where: { userId } })
  if (!existing) throw new Error('PROFILE_NOT_FOUND')

  const updated = await prisma.providerProfile.update({
    where: { userId },
    data: {
      ...(data.bio !== undefined && { bio: data.bio }),
      ...(data.servicePhotoUrls !== undefined && { servicePhotoUrls: data.servicePhotoUrls }),
      ...(data.pricingModel !== undefined && { pricingModel: data.pricingModel }),
      ...(data.languages !== undefined && { languages: data.languages }),
      ...(data.workingHours !== undefined && {
        workingHours: data.workingHours as Prisma.InputJsonValue,
      }),
      ...(data.isAvailable !== undefined && { isAvailable: data.isAvailable }),
    },
  })

  // Promote to PROFILE_COMPLETE once core fields are populated
  const isComplete =
    !!updated.bio &&
    updated.servicePhotoUrls.length > 0 &&
    updated.languages.length > 0

  if (isComplete) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { verificationStatus: true },
    })
    if (user?.verificationStatus === 'REGISTERED') {
      await prisma.user.update({
        where: { id: userId },
        data: { verificationStatus: 'PROFILE_COMPLETE' },
      })
    }
  }

  return updated
}

// ─── Update tax info ──────────────────────────────────────────────────────────

export async function updateTaxInfo(
  userId: string,
  data: {
    isKleinunternehmer: boolean
    vatNumber?: string
    legalName: string
    taxId?: string
  }
) {
  const existing = await prisma.providerProfile.findUnique({ where: { userId } })
  if (!existing) throw new Error('PROFILE_NOT_FOUND')

  return prisma.providerProfile.update({
    where: { userId },
    data: {
      isKleinunternehmer: data.isKleinunternehmer,
      vatNumber: data.vatNumber ?? null,
      legalName: data.legalName,
      taxId: data.taxId ?? null,
    },
  })
}

// ─── Set service areas ────────────────────────────────────────────────────────

export async function setServiceAreas(
  userId: string,
  areas: Array<{ homePlz: string; radiusKm: number; plzList?: string[] }>
) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId } })
  if (!profile) throw new Error('PROFILE_NOT_FOUND')

  return prisma.$transaction(async (tx) => {
    await tx.serviceArea.deleteMany({ where: { providerProfileId: profile.id } })

    if (areas.length > 0) {
      await tx.serviceArea.createMany({
        data: areas.map((a) => ({
          providerProfileId: profile.id,
          homePlz: a.homePlz,
          radiusKm: a.radiusKm,
          plzList: a.plzList ?? [],
        })),
      })
    }

    return tx.serviceArea.findMany({
      where: { providerProfileId: profile.id },
      orderBy: { createdAt: 'asc' },
    })
  })
}

// ─── Set provider categories ──────────────────────────────────────────────────

export async function setProviderCategories(userId: string, categoryIds: string[]) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId } })
  if (!profile) throw new Error('PROFILE_NOT_FOUND')

  return prisma.$transaction(async (tx) => {
    if (categoryIds.length === 0) {
      await tx.providerCategory.deleteMany({ where: { providerProfileId: profile.id } })
      return []
    }

    // Validate all submitted category IDs exist and are active
    const validCategories = await tx.category.findMany({
      where: { id: { in: categoryIds }, isActive: true },
      select: { id: true },
    })
    if (validCategories.length !== categoryIds.length) {
      throw new Error('INVALID_CATEGORY')
    }

    // Remove categories that are no longer selected (preserves isVerified on kept ones)
    await tx.providerCategory.deleteMany({
      where: { providerProfileId: profile.id, categoryId: { notIn: categoryIds } },
    })

    // Create new entries; skip if row already exists
    await tx.providerCategory.createMany({
      data: categoryIds.map((categoryId) => ({
        providerProfileId: profile.id,
        categoryId,
      })),
      skipDuplicates: true,
    })

    return tx.providerCategory.findMany({
      where: { providerProfileId: profile.id },
      include: {
        category: { select: { id: true, name: true, slug: true, icon: true } },
      },
    })
  })
}

// ─── Category-specific verification docs ──────────────────────────────────────

export async function submitCategoryVerificationDocs(userId: string, categoryId: string, docUrls: string[]) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId } })
  if (!profile) throw new Error('PROFILE_NOT_FOUND')

  return prisma.providerCategory.update({
    where: { providerProfileId_categoryId: { providerProfileId: profile.id, categoryId } },
    data: { verificationDocUrls: docUrls, isVerified: false },
  })
}

export async function reviewCategoryVerification(
  providerUserId: string,
  categoryId: string,
  isVerified: boolean,
  adminUserId: string
) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId: providerUserId } })
  if (!profile) throw new Error('PROFILE_NOT_FOUND')

  const updated = await prisma.providerCategory.update({
    where: { providerProfileId_categoryId: { providerProfileId: profile.id, categoryId } },
    data: { isVerified },
  })

  await prisma.auditLog.create({
    data: {
      userId: adminUserId,
      targetUserId: providerUserId,
      actionType: isVerified ? 'CATEGORY_VERIFICATION_APPROVED' : 'CATEGORY_VERIFICATION_REJECTED',
      targetEntity: 'ProviderCategory',
      targetId: updated.id,
      metadata: { categoryId } as Prisma.InputJsonValue,
    },
  })

  return updated
}

// ─── Get public profile ───────────────────────────────────────────────────────

export async function getPublicProfile(providerProfileId: string) {
  const profile = await prisma.providerProfile.findUnique({
    where: { id: providerProfileId },
    select: {
      id: true,
      bio: true,
      servicePhotoUrls: true,
      pricingModel: true,
      languages: true,
      isAvailable: true,
      averageRating: true,
      totalReviews: true,
      workingHours: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          displayName: true,
          profilePhotoUrl: true,
          createdAt: true,
          verificationStatus: true,
        },
      },
      serviceAreas: {
        select: { id: true, homePlz: true, radiusKm: true, plzList: true },
      },
      providerCategories: {
        include: {
          category: { select: { id: true, name: true, slug: true, icon: true } },
        },
      },
      ratings: {
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          score: true,
          comment: true,
          createdAt: true,
          customerRater: {
            select: {
              user: { select: { displayName: true, profilePhotoUrl: true } },
            },
          },
        },
      },
    },
  })

  if (!profile) throw new Error('NOT_FOUND')
  return profile
}

// ─── Update KYC status (admin only) ──────────────────────────────────────────

export async function updateKycStatus(
  userId: string,
  status: 'KYC_VERIFIED' | 'KYC_REJECTED' | 'KYC_PENDING' | 'KYC_RESUBMISSION',
  adminUserId: string,
  note?: string
) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('USER_NOT_FOUND')

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { verificationStatus: status },
  })

  await prisma.auditLog.create({
    data: {
      userId: adminUserId,
      targetUserId: userId,
      actionType: 'KYC_STATUS_UPDATED',
      targetEntity: 'User',
      targetId: userId,
      metadata: {
        previousStatus: user.verificationStatus,
        newStatus: status,
        ...(note && { note }),
      } as Prisma.InputJsonValue,
    },
  })

  return updated
}
