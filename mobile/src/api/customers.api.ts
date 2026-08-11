import { apiClient } from './client'

export interface CustomerReview {
  id: string
  score: number
  comment?: string
  createdAt: string
  reviewerName: string
}

export interface PublicCustomerProfile {
  id: string
  displayName: string
  profilePhotoUrl?: string
  memberSince: string
  averageRating: number
  totalReviews: number
  reviews: CustomerReview[]
}

export const customersApi = {
  get: (id: string) =>
    apiClient.get<{ customer: PublicCustomerProfile }>(`/api/customers/${id}`),
}
