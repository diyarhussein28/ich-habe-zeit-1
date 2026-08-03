import { prisma } from '../config/prisma.js'
import type { Prisma } from '@prisma/client'

export async function listCategories(includeInactive = false) {
  return prisma.category.findMany({
    where: {
      parentId: null,
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: {
      children: {
        where: includeInactive ? {} : { isActive: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { sortOrder: 'asc' },
  })
}

export async function getCategoryById(id: string) {
  return prisma.category.findUnique({
    where: { id },
    include: { children: { orderBy: { sortOrder: 'asc' } }, parent: true },
  })
}

export async function createCategory(data: {
  name: string
  slug: string
  description?: string
  iconUrl?: string
  parentId?: string
  commissionRate?: number
  geoRestrictions?: string[]
  customFields?: unknown
  sortOrder?: number
}) {
  const existing = await prisma.category.findUnique({ where: { slug: data.slug } })
  if (existing) throw new Error('SLUG_TAKEN')

  return prisma.category.create({
    data: {
      ...data,
      customFields: data.customFields as Prisma.InputJsonValue | undefined,
      ...(data.parentId ? { parent: { connect: { id: data.parentId } } } : {}),
      parentId: undefined,
    },
  })
}

export async function updateCategory(id: string, data: Partial<{
  name: string
  description: string
  iconUrl: string
  commissionRate: number
  geoRestrictions: string[]
  customFields: unknown
  isActive: boolean
  sortOrder: number
}>) {
  return prisma.category.update({
    where: { id },
    data: {
      ...data,
      customFields: data.customFields as Prisma.InputJsonValue | undefined,
    },
  })
}

export async function getEffectiveCommissionRate(categoryId: string, cityCode?: string): Promise<number> {
  // Check city-specific rule first
  if (cityCode) {
    const cityRule = await prisma.commissionRule.findFirst({
      where: { cityCode, isActive: true },
      orderBy: { createdAt: 'desc' },
    })
    if (cityRule) return cityRule.rate
  }

  // Check category-specific rule
  const categoryRule = await prisma.commissionRule.findFirst({
    where: { categoryId, cityCode: null, isActive: true },
    orderBy: { createdAt: 'desc' },
  })
  if (categoryRule) return categoryRule.rate

  // Check category's own rate
  const category = await prisma.category.findUnique({ where: { id: categoryId } })
  if (category?.commissionRate) return category.commissionRate

  // Fall back to global rule
  const globalRule = await prisma.commissionRule.findFirst({
    where: { isGlobal: true, isActive: true },
    orderBy: { createdAt: 'desc' },
  })
  return globalRule?.rate ?? 0.15 // 15% default
}
