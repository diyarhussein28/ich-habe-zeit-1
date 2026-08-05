import type { FastifyInstance } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import { prisma } from '../config/prisma.js'
import { sendMessage, getMessages } from '../services/chat.service.js'
import { notifyEvent } from '../services/notification.service.js'

// orderId → live connections
const rooms = new Map<string, Set<WebSocket>>()

function broadcast(orderId: string, payload: object, exclude?: WebSocket) {
  const clients = rooms.get(orderId)
  if (!clients) return
  const data = JSON.stringify(payload)
  for (const client of clients) {
    if (client !== exclude && client.readyState === 1) {
      client.send(data)
    }
  }
}

function send(socket: WebSocket, payload: object) {
  if (socket.readyState === 1) socket.send(JSON.stringify(payload))
}

export async function chatGateway(app: FastifyInstance) {
  app.get('/ws/chat', { websocket: true }, async (socket, request) => {
    const { token, orderId } = request.query as { token?: string; orderId?: string }

    if (!token || !orderId) {
      socket.close(1008, 'Missing token or orderId')
      return
    }

    // Verify JWT manually (can't use request.jwtVerify() — no Authorization header on WS)
    let userId: string
    let sessionToken: string
    try {
      const payload = app.jwt.verify<{ sub: string; sessionToken: string }>(token)
      userId = payload.sub
      sessionToken = payload.sessionToken
    } catch {
      socket.close(1008, 'Invalid token')
      return
    }

    // Verify session is still active
    const session = await prisma.session.findFirst({
      where: { token: sessionToken, userId, revokedAt: null, expiresAt: { gt: new Date() } },
    })
    if (!session) {
      socket.close(1008, 'Session expired')
      return
    }

    // Verify the user has access to this order's chat
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { offer: { include: { provider: true } } },
    })
    if (!order) { socket.close(1008, 'Order not found'); return }

    const isParticipant =
      order.customerId === userId || order.offer.provider.userId === userId
    if (!isParticipant) { socket.close(1008, 'Forbidden'); return }

    // Join room
    if (!rooms.has(orderId)) rooms.set(orderId, new Set())
    rooms.get(orderId)!.add(socket)

    // Send message history immediately on connect
    try {
      const messages = await getMessages(orderId, userId, 50)
      send(socket, { type: 'history', messages })
    } catch {}

    // Incoming messages
    socket.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; content?: string }

        if (msg.type === 'send' && msg.content?.trim()) {
          const saved = await sendMessage(orderId, userId, msg.content.trim())
          const payload = { type: 'message', data: saved }
          // Echo back to sender so they see the saved message with its id/timestamp
          send(socket, payload)
          // Push to all other participants in the room
          broadcast(orderId, payload, socket)

          // Push notification to offline party
          const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { offer: { include: { provider: true } } },
          })
          if (order) {
            const recipientId =
              userId === order.customerId ? order.offer.provider.userId : order.customerId
            const roomClients = rooms.get(orderId)
            const recipientOnline = roomClients && roomClients.size > 1
            if (!recipientOnline) {
              notifyEvent({
                userId: recipientId,
                pushType: 'NEW_MESSAGE',
                orderId,
                title: 'Neue Nachricht',
                body: msg.content.trim().slice(0, 100),
                category: 'chatMessage',
                skipEmail: true,
              }).catch(() => {})
            }
          }
        }

        if (msg.type === 'ping') {
          send(socket, { type: 'pong' })
        }
      } catch (err) {
        const message =
          err instanceof Error && err.message === 'RATE_LIMITED'
            ? 'Zu viele Nachrichten — bitte kurz warten.'
            : 'Failed to process message'
        send(socket, { type: 'error', message })
      }
    })

    socket.on('close', () => {
      rooms.get(orderId)?.delete(socket)
      if (rooms.get(orderId)?.size === 0) rooms.delete(orderId)
    })

    socket.on('error', () => {
      rooms.get(orderId)?.delete(socket)
    })
  })
}
