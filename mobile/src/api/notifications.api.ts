import { apiClient } from './client'

export const notificationsApi = {
  registerToken: (token: string, platform: 'ios' | 'android') =>
    apiClient.post('/api/notifications/token', { token, platform }),

  unregisterToken: (token: string) =>
    apiClient.delete('/api/notifications/token', { data: { token } }),
}
