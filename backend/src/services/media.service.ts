import path from 'node:path'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import { flagContentForModeration } from './moderation.service.js'
import type { ModerationContentType } from '@prisma/client'

export const PUBLIC_UPLOADS_DIR = path.resolve('uploads', 'public')

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024

// Publicly-viewable image upload (profile photos, service photos, request/completion
// photos). Distinct from KYC document storage, which stays private and access-logged.
export async function uploadPublicImage(
  ownerId: string,
  contentType: ModerationContentType,
  buffer: Buffer,
  mimeType: string
): Promise<{ url: string }> {
  const ext = ALLOWED_MIME[mimeType]
  if (!ext) throw new Error('INVALID_MIME_TYPE')
  if (buffer.length > MAX_PHOTO_BYTES) throw new Error('FILE_TOO_LARGE')

  const dir = path.join(PUBLIC_UPLOADS_DIR, ownerId)
  await fs.mkdir(dir, { recursive: true })

  const filename = `${randomUUID()}.${ext}`
  await fs.writeFile(path.join(dir, filename), buffer)

  const url = `${env.API_BASE_URL}/media/${ownerId}/${filename}`

  // Post-moderation: image is live immediately, but queued for admin review
  await flagContentForModeration(contentType, url, ownerId)

  return { url }
}
