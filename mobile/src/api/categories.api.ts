import { apiClient } from './client'
import type { ServiceCategory } from './types'

export interface ProviderSummary {
  id: string
  userId: string
  displayName: string
  bio?: string | null
  averageRating: number
  totalReviews: number
  languages: string[]
  isAvailable: boolean
}

export const categoriesApi = {
  list: () =>
    apiClient.get<{ categories: ServiceCategory[] }>('/api/categories'),

  get: (id: string) =>
    apiClient.get<{ category: ServiceCategory }>(`/api/categories/${id}`),

  listProviders: (categoryId: string) =>
    apiClient.get<{ providers: ProviderSummary[] }>(`/api/categories/${categoryId}/providers`),
}
