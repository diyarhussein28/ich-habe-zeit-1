import { prisma } from '../config/prisma.js'

// ─── Get my profile ──────────────────────────────────────────────────────────

export async function getMyProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      customerProfile: true,
      providerProfile: {
        include: {
          serviceAreas: true,
          providerCategories: {
            include: { category: { select: { id: true, name: true, slug: true, icon: true } } },
          },
        },
      },
      addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
      notificationSettings: true,
    },
  })

  if (!user) throw new Error('USER_NOT_FOUND')

  // Strip sensitive fields before returning
  const { passwordHash, mfaSecret, ...safeUser } = user
  return safeUser
}

// ─── Update my profile ────────────────────────────────────────────────────────

export async function updateMyProfile(
  userId: string,
  data: { displayName?: string; profilePhotoUrl?: string; dateOfBirth?: Date }
) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.profilePhotoUrl !== undefined && { profilePhotoUrl: data.profilePhotoUrl }),
      ...(data.dateOfBirth !== undefined && { dateOfBirth: data.dateOfBirth }),
    },
    select: {
      id: true,
      displayName: true,
      profilePhotoUrl: true,
      dateOfBirth: true,
      email: true,
      emailVerified: true,
      phone: true,
      phoneVerified: true,
      role: true,
      verificationStatus: true,
      isActive: true,
      updatedAt: true,
    },
  })
}

// ─── Add address ──────────────────────────────────────────────────────────────

export async function addAddress(
  userId: string,
  data: {
    label: string
    street: string
    city: string
    plz: string
    lat?: number
    lon?: number
    isDefault?: boolean
  }
) {
  return prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      })
    }

    return tx.address.create({
      data: {
        userId,
        label: data.label,
        street: data.street,
        city: data.city,
        plz: data.plz,
        lat: data.lat,
        lon: data.lon,
        isDefault: data.isDefault ?? false,
      },
    })
  })
}

// ─── Update address ───────────────────────────────────────────────────────────

export async function updateAddress(
  addressId: string,
  userId: string,
  data: Partial<{
    label: string
    street: string
    city: string
    plz: string
    lat: number
    lon: number
    isDefault: boolean
  }>
) {
  const address = await prisma.address.findUnique({ where: { id: addressId } })
  if (!address) throw new Error('ADDRESS_NOT_FOUND')
  if (address.userId !== userId) throw new Error('FORBIDDEN')

  return prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.address.updateMany({
        where: { userId, isDefault: true, id: { not: addressId } },
        data: { isDefault: false },
      })
    }

    return tx.address.update({
      where: { id: addressId },
      data,
    })
  })
}

// ─── Delete address ───────────────────────────────────────────────────────────

export async function deleteAddress(addressId: string, userId: string) {
  const address = await prisma.address.findUnique({ where: { id: addressId } })
  if (!address) throw new Error('ADDRESS_NOT_FOUND')
  if (address.userId !== userId) throw new Error('FORBIDDEN')

  await prisma.address.delete({ where: { id: addressId } })
}

// ─── List addresses ───────────────────────────────────────────────────────────

export async function listAddresses(userId: string) {
  return prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
}

// ─── Get notification settings ────────────────────────────────────────────────

export async function getNotificationSettings(userId: string) {
  const settings = await prisma.notificationSettings.findUnique({ where: { userId } })
  if (settings) return settings

  // Create defaults on first access
  return prisma.notificationSettings.create({ data: { userId } })
}

// ─── Update notification settings ────────────────────────────────────────────

export async function updateNotificationSettings(
  userId: string,
  data: Partial<{
    pushEnabled: boolean
    emailEnabled: boolean
    smsEnabled: boolean
    newOfferPush: boolean
    newOfferEmail: boolean
    chatMessagePush: boolean
    marketingEmail: boolean
  }>
) {
  return prisma.notificationSettings.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  })
}
