import { apiClient } from './client'

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'

export interface SupportMessage {
  id: string
  ticketId: string
  senderId: string
  content: string
  isInternal: boolean
  createdAt: string
}

export interface SupportTicket {
  id: string
  userId: string
  subject: string
  description: string
  status: TicketStatus
  assignedToId: string | null
  orderId: string | null
  createdAt: string
  updatedAt: string
  messages?: SupportMessage[]
}

export const supportApi = {
  list: () => apiClient.get<{ tickets: SupportTicket[] }>('/api/support'),

  create: (subject: string, description: string, orderId?: string) =>
    apiClient.post<{ ticket: SupportTicket }>('/api/support', { subject, description, orderId }),

  get: (id: string) => apiClient.get<{ ticket: SupportTicket }>(`/api/support/${id}`),

  sendMessage: (id: string, content: string) =>
    apiClient.post<{ message: SupportMessage }>(`/api/support/${id}/messages`, { content }),
}
