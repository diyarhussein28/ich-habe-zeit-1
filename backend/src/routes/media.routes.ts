import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth.middleware.js'
import { uploadPublicImage } from '../services/media.service.js'
import type { ModerationContentType } from '@prisma/client'

const VALID_CONTEXTS = new Set<ModerationContentType>([
  'PROFILE_PHOTO',
  'SERVICE_PHOTO',
  'REQUEST_PHOTO',
  'COMPLETION_PHOTO',
  'DISPUTE_EVIDENCE',
  'REVIEW_PHOTO',
])

export async function mediaRoutes(app: FastifyInstance) {
  // POST /media/upload — multipart: field `context` + file `file`
  app.post('/upload', { preHandler: requireAuth }, async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.status(400).send({ error: 'MULTIPART_REQUIRED' })
    }

    let context: string | undefined
    let fileBuffer: Buffer | undefined
    let mimeType = 'application/octet-stream'

    const parts = request.parts({ limits: { fileSize: 8 * 1024 * 1024 } })
    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'context') {
        context = part.value as string
      } else if (part.type === 'file' && part.fieldname === 'file') {
        fileBuffer = await part.toBuffer()
        mimeType = part.mimetype
      }
    }

    if (!context || !VALID_CONTEXTS.has(context as ModerationContentType)) {
      return reply.status(400).send({ error: 'INVALID_CONTEXT' })
    }
    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: 'FILE_REQUIRED' })
    }

    try {
      const result = await uploadPublicImage(
        request.userId,
        context as ModerationContentType,
        fileBuffer,
        mimeType
      )
      return reply.status(201).send(result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(msg === 'FILE_TOO_LARGE' || msg === 'INVALID_MIME_TYPE' ? 400 : 500).send({ error: msg })
    }
  })
}
