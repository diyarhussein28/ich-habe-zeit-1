import type { FastifyInstance } from 'fastify'
import { requireAuth, requireRole } from '../middleware/auth.middleware.js'
import { getInvoiceArchive, getKleinunternehmerStatus } from '../services/invoice.service.js'
import { buildInvoicePdf } from '../services/invoice.pdf.js'

export async function invoiceRoutes(app: FastifyInstance) {
  // GET /api/invoices — list all invoices for the authenticated user (Auftraggeber or Dienstleister)
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const invoices = await getInvoiceArchive(request.userId)
    return reply.send({ invoices })
  })

  // GET /api/invoices/kleinunternehmer-status — provider's own §19 UStG threshold tracking
  app.get('/kleinunternehmer-status', { preHandler: requireRole('PROVIDER') }, async (request, reply) => {
    try {
      const status = await getKleinunternehmerStatus(request.userId)
      return reply.send(status)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(404).send({ error: msg })
    }
  })

  // GET /api/invoices/:id/pdf — download invoice as PDF
  app.get('/:id/pdf', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const buffer = await buildInvoicePdf(id, request.userId)
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="Rechnung-${id.slice(-8)}.pdf"`)
        .header('Content-Length', buffer.length)
        .send(buffer)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      if (msg === 'INVOICE_NOT_FOUND') return reply.status(404).send({ error: msg })
      if (msg === 'FORBIDDEN') return reply.status(403).send({ error: msg })
      return reply.status(500).send({ error: 'PDF_GENERATION_FAILED' })
    }
  })
}
