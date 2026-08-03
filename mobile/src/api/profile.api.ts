import { apiClient } from './client'
import type { User } from './types'

export interface FullProfile extends User {
  phone?: string
  dateOfBirth?: string
  profilePhotoUrl?: string
}

export interface ProfileCategory {
  id: string
  name: string
  icon?: string | null
  isVerified: boolean
}

export const profileApi = {
  getMe: () =>
    apiClient.get<{ profile: FullProfile }>('/api/profile'),

  update: (data: { displayName?: string }) =>
    apiClient.patch<{ profile: FullProfile }>('/api/profile', data),

  getProviderCategories: () =>
    apiClient.get<{ categories: ProfileCategory[] }>('/api/profile/provider/categories'),

  setProviderCategories: (categoryIds: string[]) =>
    apiClient.put<{ categories: ProfileCategory[] }>('/api/profile/provider/categories', { categoryIds }),
}
