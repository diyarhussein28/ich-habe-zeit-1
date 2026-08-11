import { apiClient } from './client'
import type { Order, ChatMessage, PaginatedResponse } from './types'

export const ordersApi = {
  list: (params?: { page?: number; limit?: number; status?: string; perspective?: 'customer' | 'provider' }) =>
    apiClient.get<{ orders: Order[] }>('/api/orders', { params }),

  get: (id: string) =>
    apiClient.get<{ order: Order }>(`/api/orders/${id}`),

  initPayment: (id: string) =>
    apiClient.post<{ clientSecret: string; paymentIntentId: string; customerId: string; ephemeralKeySecret: string }>(`/api/orders/${id}/pay`),

  confirmPayment: (id: string, paymentIntentId: string) =>
    apiClient.post<{ order: Order }>(`/api/orders/${id}/pay/confirm`, { paymentIntentId }),

  markComplete: (id: string) =>
    apiClient.post<Order>(`/api/orders/${id}/complete`),

  releasePayment: (id: string) =>
    apiClient.post<Order>(`/api/orders/${id}/release`),

  cancel: (id: string) =>
    apiClient.post<Order>(`/api/orders/${id}/cancel`),

  simulatePayment: (id: string) =>
    apiClient.post<{ order: Order }>(`/api/orders/${id}/pay/simulate`),

  getMessages: (orderId: string, params?: { before?: string; limit?: number }) =>
    apiClient.get<PaginatedResponse<ChatMessage>>(`/api/orders/${orderId}/messages`, { params }),

  sendMessage: (orderId: string, content: string) =>
    apiClient.post<ChatMessage>(`/api/orders/${orderId}/messages`, { content }),
}
