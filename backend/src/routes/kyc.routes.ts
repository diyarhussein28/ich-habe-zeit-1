import fs from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth.middleware.js'
import {
  uploadKycDocument,
  getKycDocuments,
  deleteKycDocument,
  submitKycForReview,
  getKycDocumentFile,
} from '../services/kyc.service.js'
import type { KycDocumentType } from '@prisma/client'

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
])

const VALID_TYPES = new Set<KycDocumentType>(['ID_FRONT', 'ID_BACK', 'SELFIE_WITH_ID'])

export async function kycRoutes(app: FastifyInstance) {
  // GET /api/kyc/documents
  app.get('/documents', { preHandler: requireAuth }, async (request, reply) => {
    const docs = await getKycDocuments(request.userId)
    return reply.send({ documents: docs })
  })

  // POST /api/kyc/documents — multipart: fields `type` + file `file`
  app.post('/documents', { preHandler: requireAuth }, async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.status(400).send({ error: 'MULTIPART_REQUIRED' })
    }

    let docType: string | undefined
    let fileBuffer: Buffer | undefined
    let fileName = 'upload'
    let mimeType = 'application/octet-stream'

    const parts = request.parts({ limits: { fileSize: 10 * 1024 * 1024 } })
    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'type') {
        docType = part.value as string
      } else if (part.type === 'file' && part.fieldname === 'file') {
        fileBuffer = await part.toBuffer()
        fileName = part.filename || 'upload'
        mimeType = part.mimetype
      }
    }

    if (!docType || !VALID_TYPES.has(docType as KycDocumentType)) {
      return reply.status(400).send({ error: 'INVALID_DOCUMENT_TYPE' })
    }
    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: 'FILE_REQUIRED' })
    }
    if (!ALLOWED_MIME.has(mimeType)) {
      return reply.status(400).send({ error: 'INVALID_MIME_TYPE' })
    }

    try {
      const doc = await uploadKycDocument(
        request.userId,
        docType as KycDocumentType,
        fileBuffer,
        fileName,
        mimeType,
      )
      return reply.status(201).send({ document: doc })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(500).send({ error: msg })
    }
  })

  // DELETE /api/kyc/documents/:id
  app.delete('/documents/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await deleteKycDocument(id, request.userId)
      return reply.send({ message: 'Deleted' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(msg === 'FORBIDDEN' ? 403 : 404).send({ error: msg })
    }
  })

  // GET /api/kyc/documents/:id/file — protected file download
  app.get('/documents/:id/file', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const { absPath, mimeType, fileName } = await getKycDocumentFile(id, request.userId, request.userRole)
      const stream = fs.createReadStream(absPath)
      return reply
        .header('Content-Type', mimeType)
        .header('Content-Disposition', `inline; filename="${fileName}"`)
        .send(stream)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(msg === 'FORBIDDEN' ? 403 : 404).send({ error: msg })
    }
  })

  // POST /api/kyc/submit
  app.post('/submit', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const result = await submitKycForReview(request.userId)
      return reply.send(result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(400).send({ error: msg })
    }
  })
}
