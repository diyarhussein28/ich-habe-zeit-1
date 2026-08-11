import { prisma } from '../config/prisma.js'

// ─── Submit rating ────────────────────────────────────────────────────────────

export async function submitRating(data: {
  orderId: string
  raterUserId: string
  score: number
  comment?: string
}) {
  if (data.score < 1 || data.score > 5) throw new Error('INVALID_SCORE')

  const order = await prisma.order.findUnique({
    where: { id: data.orderId },
    include: {
      offer: { include: { provider: true } },
      request: { include: { customer: true } },
    },
  })

  if (!order) throw new Error('ORDER_NOT_FOUND')

  const releasableStatuses = ['RELEASED', 'REFUNDED', 'PARTIALLY_RELEASED']
  if (!releasableStatuses.includes(order.status)) {
    throw new Error('ORDER_NOT_COMPLETED')
  }

  const isCustomer = order.customerId === data.raterUserId
  const isProvider = order.offer.provider.userId === data.raterUserId

  if (!isCustomer && !isProvider) throw new Error('FORBIDDEN')

  const customerProfile = order.request.customer
  const providerProfile = order.offer.provider

  // Guard against duplicate ratings per side per order
  if (isCustomer) {
    const existing = await prisma.rating.findFirst({
      where: { orderId: data.orderId, customerRaterId: customerProfile.id },
    })
    if (existing) throw new Error('ALREADY_RATED')
  } else {
    const existing = await prisma.rating.findFirst({
      where: { orderId: data.orderId, providerRaterId: providerProfile.id },
    })
    if (existing) throw new Error('ALREADY_RATED')
  }

  return prisma.$transaction(async (tx) => {
    const rating = await tx.rating.create({
      data: {
        orderId: data.orderId,
        score: data.score,
        comment: data.comment,
        ...(isCustomer
          ? {
              customerRaterId: customerProfile.id,
              providerReceiverId: providerProfile.id,
            }
          : {
              providerRaterId: providerProfile.id,
              customerReceiverId: customerProfile.id,
            }),
      },
    })

    // Recompute provider aggregate stats when a customer rates them
    if (isCustomer) {
      const allRatings = await tx.rating.findMany({
        where: { providerReceiverId: providerProfile.id },
        select: { score: true },
      })
      const totalReviews = allRatings.length
      const averageRating =
        totalReviews > 0
          ? allRatings.reduce((sum, r) => sum + r.score, 0) / totalReviews
          : 0

      await tx.providerProfile.update({
        where: { id: providerProfile.id },
        data: {
          totalReviews,
          averageRating: Math.round(averageRating * 100) / 100,
        },
      })
    } else {
      // Recompute customer aggregate stats when a provider rates them
      const allRatings = await tx.rating.findMany({
        where: { customerReceiverId: customerProfile.id },
        select: { score: true },
      })
      const totalReviews = allRatings.length
      const averageRating =
        totalReviews > 0
          ? allRatings.reduce((sum, r) => sum + r.score, 0) / totalReviews
          : 0

      await tx.customerProfile.update({
        where: { id: customerProfile.id },
        data: {
          totalReviews,
          averageRating: Math.round(averageRating * 100) / 100,
        },
      })
    }

    return rating
  })
}

// ─── Get ratings for provider ─────────────────────────────────────────────────

export async function getRatingsForProvider(
  providerProfileId: string,
  limit = 20,
  offset = 0
) {
  const [total, items] = await Promise.all([
    prisma.rating.count({ where: { providerReceiverId: providerProfileId } }),
    prisma.rating.findMany({
      where: { providerReceiverId: providerProfileId },
      include: {
        customerRater: {
          select: {
            user: {
              select: { id: true, displayName: true, profilePhotoUrl: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
  ])

  return { total, items }
}

// ─── Get ratings for customer ─────────────────────────────────────────────────

export async function getRatingsForCustomer(
  customerProfileId: string,
  limit = 20,
  offset = 0
) {
  const [total, items] = await Promise.all([
    prisma.rating.count({ where: { customerReceiverId: customerProfileId } }),
    prisma.rating.findMany({
      where: { customerReceiverId: customerProfileId },
      include: {
        providerRater: {
          select: {
            user: {
              select: { id: true, displayName: true, profilePhotoUrl: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
  ])

  return { total, items }
}
