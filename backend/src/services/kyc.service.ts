import path from 'node:path'
import fs from 'node:fs/promises'
import { prisma } from '../config/prisma.js'
import type { KycDocumentType } from '@prisma/client'

export const UPLOADS_DIR = path.resolve('uploads', 'kyc')

export async function ensureUploadsDir(userId: string) {
  await fs.mkdir(path.join(UPLOADS_DIR, userId), { recursive: true })
}

export async function uploadKycDocument(
  userId: string,
  type: KycDocumentType,
  buffer: Buffer,
  originalName: string,
  mimeType: string,
) {
  await ensureUploadsDir(userId)

  const ext = originalName.split('.').pop()?.toLowerCase() ?? 'bin'
  const safeFilename = `${type.toLowerCase()}.${ext}`
  const absPath = path.join(UPLOADS_DIR, userId, safeFilename)
  await fs.writeFile(absPath, buffer)

  const fileKey = path.posix.join('kyc', userId, safeFilename)

  // Upsert: one document per (userId, type)
  return prisma.kycDocument.upsert({
    where: { userId_type: { userId, type } },
    update: {
      fileKey,
      fileName: originalName,
      mimeType,
      fileSizeBytes: buffer.length,
      status: 'UPLOADED',
      reviewNote: null,
      reviewedById: null,
      reviewedAt: null,
    },
    create: {
      userId,
      type,
      fileKey,
      fileName: originalName,
      mimeType,
      fileSizeBytes: buffer.length,
    },
  })
}

export async function getKycDocuments(userId: string) {
  return prisma.kycDocument.findMany({
    where: { userId },
    orderBy: { type: 'asc' },
  })
}

export async function deleteKycDocument(id: string, userId: string) {
  const doc = await prisma.kycDocument.findUnique({ where: { id } })
  if (!doc) throw new Error('NOT_FOUND')
  if (doc.userId !== userId) throw new Error('FORBIDDEN')

  // Remove file from disk
  try {
    await fs.unlink(path.join(UPLOADS_DIR, '..', doc.fileKey))
  } catch {}

  await prisma.kycDocument.delete({ where: { id } })
}

export async function submitKycForReview(userId: string) {
  const docs = await prisma.kycDocument.findMany({ where: { userId } })
  const types = new Set(docs.map((d) => d.type))

  if (!types.has('ID_FRONT') || !types.has('ID_BACK') || !types.has('SELFIE_WITH_ID')) {
    throw new Error('INCOMPLETE_DOCUMENTS')
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { verificationStatus: 'KYC_PENDING' },
    select: { verificationStatus: true },
  })

  return user
}

export async function getKycDocumentFile(id: string, userId: string) {
  const doc = await prisma.kycDocument.findUnique({ where: { id } })
  if (!doc) throw new Error('NOT_FOUND')

  // Allow the owner or admins (caller must already be verified by middleware)
  if (doc.userId !== userId) throw new Error('FORBIDDEN')

  const absPath = path.resolve('uploads', doc.fileKey)
  return { absPath, mimeType: doc.mimeType, fileName: doc.fileName }
}
