import { api } from './client'

export interface ServiceListing {
  id: string
  providerId: string
  categoryId: string
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
  category?: { id: string; name: string; iconUrl?: string }
  provider?: {
    id: string
    bio?: string
    averageRating: number
    totalReviews: number
    user: { id: string; displayName: string; profilePhotoUrl?: string }
  }
}

export interface ListingsQuery {
  categoryId?: string
  city?: string
  plz?: string
  priceMax?: number
  pricingModel?: 'FIXED_PRICE' | 'PER_HOUR'
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
    api.get<{ items: ServiceListing[]; total: number }>('/api/listings', { params }),

  getById: (id: string) =>
    api.get<{ listing: ServiceListing }>(`/api/listings/${id}`),

  create: (data: CreateListingInput) =>
    api.post<{ listing: ServiceListing }>('/api/listings', data),

  update: (id: string, data: Partial<CreateListingInput> & { status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' }) =>
    api.patch<{ listing: ServiceListing }>(`/api/listings/${id}`, data),

  book: (id: string, preferredDate?: string) =>
    api.post<{ order: { id: string; status: string; grossAmount: number } }>(
      `/api/listings/${id}/book`,
      preferredDate ? { preferredDate } : {},
    ),
}
