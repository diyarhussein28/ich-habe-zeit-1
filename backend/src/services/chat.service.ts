import { prisma } from '../config/prisma.js'
import { notifyEvent } from './notification.service.js'

const CONTACT_REGEX = /(\+\d{7,15}|@\S+\.\S+|\d{10,11}|[\w.]+@[\w.]+\.\w+)/i

// ─── Rate limiting: max 20 messages/min per user, across REST and WebSocket ───

const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60_000
const recentSendTimestamps = new Map<string, number[]>()

function enforceRateLimit(senderId: string) {
  const now = Date.now()
  const recent = (recentSendTimestamps.get(senderId) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  )
  if (recent.length >= RATE_LIMIT_MAX) {
    throw new Error('RATE_LIMITED')
  }
  recent.push(now)
  recentSendTimestamps.set(senderId, recent)
}

export async function getChatForOrder(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { offer: { include: { provider: true } } },
  })
  if (!order) throw new Error('ORDER_NOT_FOUND')

  const isCustomer = order.customerId === userId
  const isProvider = order.offer.provider.userId === userId
  if (!isCustomer && !isProvider) throw new Error('FORBIDDEN')

  return prisma.chat.findUnique({
    where: { orderId },
    include: {
      messages: {
        include: { attachments: true },
        orderBy: { createdAt: 'asc' },
        take: 100,
      },
    },
  })
}

export async function sendMessage(
  orderId: string,
  senderId: string,
  content: string,
  attachmentUrls: Array<{ fileUrl: string; fileName: string; fileType: string; fileSizeBytes: number }> = []
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { offer: { include: { provider: true } } },
  })
  if (!order) throw new Error('ORDER_NOT_FOUND')

  const isCustomer = order.customerId === senderId
  const isProvider = order.offer.provider.userId === senderId
  if (!isCustomer && !isProvider) throw new Error('FORBIDDEN')

  enforceRateLimit(senderId)

  // Detect off-platform contact sharing
  if (CONTACT_REGEX.test(content)) {
    await prisma.auditLog.create({
      data: {
        userId: senderId,
        actionType: 'CHAT_CONTACT_SHARING_DETECTED',
        targetEntity: 'Order',
        targetId: orderId,
        metadata: { content: content.substring(0, 200) },
      },
    })
  }

  const chat = await prisma.chat.findUnique({ where: { orderId } })
  if (!chat) throw new Error('CHAT_NOT_FOUND')

  return prisma.chatMessage.create({
    data: {
      chatId: chat.id,
      senderId,
      content,
      attachments: {
        create: attachmentUrls.map((a) => ({
          fileUrl: a.fileUrl,
          fileName: a.fileName,
          fileType: a.fileType,
          fileSizeBytes: a.fileSizeBytes,
        })),
      },
    },
    include: { attachments: true },
  })
}

export async function getMessages(orderId: string, userId: string, limit = 50, before?: string) {
  const chat = await prisma.chat.findUnique({ where: { orderId } })
  if (!chat) throw new Error('CHAT_NOT_FOUND')

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { offer: { include: { provider: true } } },
  })
  if (!order) throw new Error('ORDER_NOT_FOUND')

  const isCustomer = order.customerId === userId
  const isProvider = order.offer.provider.userId === userId
  if (!isCustomer && !isProvider) throw new Error('FORBIDDEN')

  const messages = await prisma.chatMessage.findMany({
    where: {
      chatId: chat.id,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    include: { attachments: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return messages.reverse()
}

// ─── Pre-offer inquiry chat (ServiceRequest, before any order exists) ─────────
// One thread per (request, provider) pair — a customer's request can have a
// separate conversation with each interested provider.

async function authorizeRequestChat(requestId: string, providerId: string, userId: string) {
  const request = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    include: { customer: true },
  })
  if (!request) throw new Error('REQUEST_NOT_FOUND')

  const provider = await prisma.providerProfile.findUnique({ where: { id: providerId } })
  if (!provider) throw new Error('PROVIDER_NOT_FOUND')

  const isCustomer = request.customer.userId === userId
  const isThisProvider = provider.userId === userId
  if (!isCustomer && !isThisProvider) throw new Error('FORBIDDEN')

  return { request, provider, isCustomer, isThisProvider }
}

export async function getOrCreateRequestChat(requestId: string, providerId: string, userId: string) {
  await authorizeRequestChat(requestId, providerId, userId)

  let chat = await prisma.chat.findUnique({
    where: { requestId_providerId: { requestId, providerId } },
  })
  if (!chat) chat = await prisma.chat.create({ data: { requestId, providerId } })

  return prisma.chat.findUnique({
    where: { id: chat.id },
    include: {
      messages: { include: { attachments: true }, orderBy: { createdAt: 'asc' }, take: 100 },
    },
  })
}

export async function sendRequestMessage(
  requestId: string,
  providerId: string,
  senderId: string,
  content: string
) {
  const { request, provider, isCustomer } = await authorizeRequestChat(requestId, providerId, senderId)
  enforceRateLimit(senderId)

  if (CONTACT_REGEX.test(content)) {
    await prisma.auditLog.create({
      data: {
        userId: senderId,
        actionType: 'CHAT_CONTACT_SHARING_DETECTED',
        targetEntity: 'ServiceRequest',
        targetId: requestId,
        metadata: { content: content.substring(0, 200) },
      },
    })
  }

  let chat = await prisma.chat.findUnique({
    where: { requestId_providerId: { requestId, providerId } },
  })
  if (!chat) chat = await prisma.chat.create({ data: { requestId, providerId } })

  const message = await prisma.chatMessage.create({
    data: { chatId: chat.id, senderId, content },
    include: { attachments: true },
  })

  const recipientId = isCustomer ? provider.userId : request.customer.userId
  notifyEvent({
    userId: recipientId,
    pushType: 'NEW_REQUEST_MESSAGE',
    requestId,
    providerId,
    title: 'Neue Nachricht',
    body: content.trim().slice(0, 100),
    category: 'chatMessage',
    skipEmail: true,
  }).catch(() => {})

  return message
}

export async function getRequestMessages(requestId: string, providerId: string, userId: string, limit = 50) {
  await authorizeRequestChat(requestId, providerId, userId)

  const chat = await prisma.chat.findUnique({
    where: { requestId_providerId: { requestId, providerId } },
  })
  if (!chat) return []

  const messages = await prisma.chatMessage.findMany({
    where: { chatId: chat.id },
    include: { attachments: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  return messages
}
