import { apiClient } from './client'

export type PackageTier = 'BASIC' | 'STANDARD' | 'PREMIUM'

export interface ListingPackage {
  id: string
  listingId: string
  tier: PackageTier
  title: string
  description: string
  price: number
  deliveryDays: number
  features: string[]
}

export interface PackageInput {
  title: string
  description: string
  price: number
  deliveryDays: number
  features: string[]
}

export interface ServiceListing {
  id: string
  providerId: string
  categoryId: string
  packages?: ListingPackage[]
  title: string
  description: string
  price: number
  pricingModel: 'FIXED_PRICE' | 'PER_HOUR'
  city: string
  plz: string
  photoUrls: string[]
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
  viewCount: number
  createdAt: string
  updatedAt: string
  category?: { id: string; name: string; icon?: string }
  provider?: {
    id: string
    bio?: string
    averageRating: number
    totalReviews: number
    user: { id: string; displayName: string; profilePhotoUrl?: string }
  }
}

export type ListingSort = 'newest' | 'price_asc' | 'price_desc' | 'rating' | 'distance'

export interface ListingsQuery {
  categoryId?: string
  city?: string
  plz?: string
  /** Server-side full-text search over title and description. */
  q?: string
  priceMin?: number
  priceMax?: number
  pricingModel?: 'FIXED_PRICE' | 'PER_HOUR'
  minRating?: number
  verifiedOnly?: boolean
  availableOnly?: boolean
  sort?: ListingSort
  limit?: number
  offset?: number
}

export interface CreateListingInput {
  categoryId: string
  title: string
  description: string
  price: number
  pricingModel?: 'FIXED_PRICE' | 'PER_HOUR'
  city: string
  plz: string
  photoUrls?: string[]
}

export const listingsApi = {
  browse: (params?: ListingsQuery) =>
    apiClient.get<{ items: ServiceListing[]; total: number }>('/api/listings', { params }),

  /** The calling provider's own listings (any status), for their listing-management screen. */
  mine: () =>
    apiClient.get<{ items: ServiceListing[]; total: number }>('/api/listings/mine'),

  getById: (id: string) =>
    apiClient.get<{ listing: ServiceListing }>(`/api/listings/${id}`),

  create: (data: CreateListingInput) =>
    apiClient.post<{ listing: ServiceListing }>('/api/listings', data),

  update: (id: string, data: Partial<CreateListingInput> & { status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' }) =>
    apiClient.patch<{ listing: ServiceListing }>(`/api/listings/${id}`, data),

  book: (id: string, preferredDate?: string) =>
    apiClient.post<{ order: { id: string; status: string; grossAmount: number } }>(
      `/api/listings/${id}/book`,
      preferredDate ? { preferredDate } : {},
    ),

  getPackages: (id: string) =>
    apiClient.get<{ packages: ListingPackage[] }>(`/api/listings/${id}/packages`),

  savePackage: (id: string, tier: PackageTier, data: PackageInput) =>
    apiClient.put<{ package: ListingPackage }>(`/api/listings/${id}/packages/${tier}`, data),

  deletePackage: (id: string, tier: PackageTier) =>
    apiClient.delete<{ deleted: boolean }>(`/api/listings/${id}/packages/${tier}`),
}
