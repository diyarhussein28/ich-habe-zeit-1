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

export const providersApi = {
  get: (id: string) =>
    apiClient.get<{ provider: PublicProviderProfile }>(`/api/providers/${id}`),
}
