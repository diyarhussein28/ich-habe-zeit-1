import { apiClient } from './client'
import type { ServiceCategory } from './types'

export const categoriesApi = {
  list: () =>
    apiClient.get<{ categories: ServiceCategory[] }>('/api/categories'),

  get: (id: string) =>
    apiClient.get<{ category: ServiceCategory }>(`/api/categories/${id}`),
}
