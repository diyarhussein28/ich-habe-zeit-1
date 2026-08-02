import { apiClient } from './client'
import type { Order, ChatMessage, PaginatedResponse } from './types'

export const ordersApi = {
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    apiClient.get<PaginatedResponse<Order>>('/api/orders', { params }),

  get: (id: string) =>
    apiClient.get<Order>(`/api/orders/${id}`),

  initPayment: (id: string) =>
    apiClient.post<{ clientSecret: string; paymentIntentId: string }>(`/api/orders/${id}/pay`),

  confirmPayment: (id: string, paymentIntentId: string) =>
    apiClient.post<{ order: Order }>(`/api/orders/${id}/pay/confirm`, { paymentIntentId }),

  markComplete: (id: string) =>
    apiClient.post<Order>(`/api/orders/${id}/complete`),

  releasePayment: (id: string) =>
    apiClient.post<Order>(`/api/orders/${id}/release`),

  openDispute: (id: string, reason: string) =>
    apiClient.post<Order>(`/api/orders/${id}/dispute`, { reason }),

  cancel: (id: string) =>
    apiClient.post<Order>(`/api/orders/${id}/cancel`),

  getMessages: (orderId: string, params?: { before?: string; limit?: number }) =>
    apiClient.get<PaginatedResponse<ChatMessage>>(`/api/orders/${orderId}/messages`, { params }),

  sendMessage: (orderId: string, content: string) =>
    apiClient.post<ChatMessage>(`/api/orders/${orderId}/messages`, { content }),
}
