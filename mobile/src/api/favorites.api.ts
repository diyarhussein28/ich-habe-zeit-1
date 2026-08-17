import { apiClient } from './client'
import type { ServiceListing } from './listings.api'

export interface FavoriteProvider {
  favoriteId: string
  id: string
  displayName: string
  profilePhotoUrl?: string
  averageRating: number
  totalReviews: number
  savedAt: string
}

export interface FavoriteListing extends ServiceListing {
  favoriteId: string
  savedAt: string
}

export const favoritesApi = {
  getMine: () =>
    apiClient.get<{ providers: FavoriteProvider[]; listings: FavoriteListing[] }>('/api/favorites'),

  addProvider: (id: string) => apiClient.post(`/api/favorites/providers/${id}`),
  removeProvider: (id: string) => apiClient.delete(`/api/favorites/providers/${id}`),

  addListing: (id: string) => apiClient.post(`/api/favorites/listings/${id}`),
  removeListing: (id: string) => apiClient.delete(`/api/favorites/listings/${id}`),
}
