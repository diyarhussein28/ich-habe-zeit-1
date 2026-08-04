import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as supportService from '../services/support.service.js'
import { requireAuth } from '../middleware/auth.middleware.js'

const createTicketSchema = z.object({
  subject: z.string().min(3).max(150),
  description: z.string().min(10).max(2000),
  orderId: z.string().uuid().optional(),
})

const sendMessageSchema = z.object({
  content: z.string().min(1).max(2000),
})

const STAFF_ROLES = ['ADMIN', 'HELP_DESK']

export async function supportRoutes(app: FastifyInstance) {
  // POST /support — open a new ticket
  app.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const body = createTicketSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    const ticket = await supportService.createTicket(
      request.userId,
      body.data.subject,
      body.data.description,
      body.data.orderId,
    )
    return reply.status(201).send({ ticket })
  })

  // GET /support — my own tickets
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const tickets = await supportService.listMyTickets(request.userId)
    return reply.send({ tickets })
  })

  // GET /support/:id — ticket detail (owner or staff)
  app.get('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const isStaff = STAFF_ROLES.includes(request.userRole)
    try {
      const ticket = await supportService.getTicketDetail(id, request.userId, isStaff)
      return reply.send({ ticket })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      return reply.status(msg === 'FORBIDDEN' ? 403 : 404).send({ error: msg })
    }
  })

  // POST /support/:id/messages — reply (owner or staff)
  app.post('/:id/messages', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = sendMessageSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: body.error.flatten() })

    const isStaff = STAFF_ROLES.includes(request.userRole)
    try {
      const message = await supportService.sendTicketMessage(
        id,
        request.userId,
        body.data.content,
        false,
        isStaff,
      )
      return reply.status(201).send({ message })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ERROR'
      const status = msg === 'FORBIDDEN' ? 403 : msg === 'NOT_FOUND' ? 404 : 400
      return reply.status(status).send({ error: msg })
    }
  })
}
