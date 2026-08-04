import { prisma } from '../config/prisma.js'

export async function createTicket(userId: string, subject: string, description: string, orderId?: string) {
  return prisma.supportTicket.create({
    data: { userId, subject, description, orderId },
  })
}

export async function listMyTickets(userId: string) {
  return prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getTicketDetail(ticketId: string, requesterId: string, isStaff: boolean) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!ticket) throw new Error('NOT_FOUND')
  if (!isStaff && ticket.userId !== requesterId) throw new Error('FORBIDDEN')

  return {
    ...ticket,
    messages: isStaff ? ticket.messages : ticket.messages.filter((m) => !m.isInternal),
  }
}

export async function sendTicketMessage(
  ticketId: string,
  senderId: string,
  content: string,
  isInternal: boolean,
  isStaff: boolean,
) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } })
  if (!ticket) throw new Error('NOT_FOUND')
  if (!isStaff && ticket.userId !== senderId) throw new Error('FORBIDDEN')
  if (isInternal && !isStaff) throw new Error('FORBIDDEN')
  if (ticket.status === 'CLOSED') throw new Error('TICKET_CLOSED')

  const message = await prisma.supportMessage.create({
    data: { ticketId, senderId, content, isInternal },
  })

  // A staff reply on a fresh ticket signals work has started; a customer
  // reply on a ticket staff had marked resolved reopens it for another look.
  if (isStaff && ticket.status === 'OPEN' && !isInternal) {
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { status: 'IN_PROGRESS' } })
  } else if (!isStaff && ticket.status === 'RESOLVED') {
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { status: 'IN_PROGRESS' } })
  }

  return message
}
