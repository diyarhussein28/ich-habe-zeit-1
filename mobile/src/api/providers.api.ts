import { apiClient } from './client'
import type { ServiceListing } from './listings.api'

export interface ProviderReview {
  id: string
  score: number
  comment?: string
  createdAt: string
  reviewerName: string
}

export interface PublicProviderProfile {
  id: string
  displayName: string
  profilePhotoUrl?: string
  memberSince: string
  bio?: string
  languages: string[]
  servicePhotoUrls: string[]
  isAvailable: boolean
  averageRating: number
  totalReviews: number
  categories: { id: string; name: string; icon?: string; isVerified: boolean }[]
  serviceAreas: { homePlz: string; radiusKm: number }[]
  listings: ServiceListing[]
  reviews: ProviderReview[]
}

export type ProviderSort = 'rating' | 'reviews' | 'newest'

export interface ProviderSearchQuery {
  q?: string
  categoryId?: string
  plz?: string
  language?: string
  minRating?: number
  verifiedOnly?: boolean
  availableOnly?: boolean
  sort?: ProviderSort
  limit?: number
  offset?: number
}

export interface ProviderSearchResult {
  id: string
  displayName: string
  profilePhotoUrl?: string
  isVerified: boolean
  bio?: string
  languages: string[]
  isAvailable: boolean
  averageRating: number
  totalReviews: number
  listingCount: number
  categories: { id: string; name: string; icon?: string; isVerified: boolean }[]
  serviceAreas: { homePlz: string; radiusKm: number }[]
}

export interface TopProvider {
  id: string
  displayName: string
  profilePhotoUrl?: string
  isVerified: boolean
  bio?: string
  averageRating: number
  totalReviews: number
  completedJobsCount: number
  categories: { id: string; name: string; icon?: string }[]
}

export const providersApi = {
  get: (id: string) =>
    apiClient.get<{ provider: PublicProviderProfile }>(`/api/providers/${id}`),

  search: (params?: ProviderSearchQuery) =>
    apiClient.get<{ items: ProviderSearchResult[]; total: number }>('/api/providers', { params }),

  /** Best-rated providers, for the "Top Dienstleister" showcase. */
  top: (params?: { limit?: number; minReviews?: number }) =>
    apiClient.get<{ items: TopProvider[] }>('/api/providers/top', { params }),
}
