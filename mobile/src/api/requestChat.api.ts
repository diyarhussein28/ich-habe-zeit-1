import { apiClient } from './client'

export interface RequestChatMessage {
  id: string
  chatId: string
  senderId: string
  content: string
  isSystem: boolean
  createdAt: string
}

export interface RequestChatThread {
  id: string
  requestId: string
  providerId: string
  createdAt: string
  provider: {
    id: string
    user: { id: string; displayName: string; profilePhotoUrl?: string }
  }
  messages: RequestChatMessage[]
}

export const requestChatApi = {
  // Provider: open/resume my own inquiry thread on a request
  openMine: (requestId: string) =>
    apiClient.post<{ chat: RequestChatThread }>(`/api/requests/${requestId}/chat`),

  // Customer: list every provider's inquiry thread on my request
  listThreads: (requestId: string) =>
    apiClient.get<{ chats: RequestChatThread[] }>(`/api/requests/${requestId}/chats`),

  getMessages: (requestId: string, providerId: string) =>
    apiClient.get<{ messages: RequestChatMessage[] }>(`/api/requests/${requestId}/chats/${providerId}/messages`),

  sendMessage: (requestId: string, providerId: string, content: string) =>
    apiClient.post<{ message: RequestChatMessage }>(`/api/requests/${requestId}/chats/${providerId}/messages`, { content }),
}
