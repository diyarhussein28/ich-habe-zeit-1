import { apiClient } from './client'

export interface AppNotification {
  id: string
  userId: string
  type: string
  title: string
  body: string
  orderId?: string | null
  requestId?: string | null
  providerId?: string | null
  readAt?: string | null
  createdAt: string
}

export const notificationsApi = {
  registerToken: (token: string, platform: 'ios' | 'android') =>
    apiClient.post('/api/notifications/token', { token, platform }),

  unregisterToken: (token: string) =>
    apiClient.delete('/api/notifications/token', { data: { token } }),

  list: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<{ notifications: AppNotification[]; unreadCount: number }>('/api/notifications', { params }),

  unreadCount: () =>
    apiClient.get<{ unreadCount: number }>('/api/notifications/unread-count'),

  markRead: (id: string) =>
    apiClient.patch<{ read: boolean }>(`/api/notifications/${id}/read`),

  markAllRead: () =>
    apiClient.post<{ read: boolean }>('/api/notifications/read-all'),
}
