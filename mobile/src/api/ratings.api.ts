import { apiClient } from './client'

export interface RatingPayload {
  rating: number
  comment?: string
  qualityScore?: number
  punctualityScore?: number
  communicationScore?: number
  photoUrls?: string[]
}

export interface Rating {
  id: string
  orderId: string
  score: number
  comment?: string
  qualityScore?: number | null
  punctualityScore?: number | null
  communicationScore?: number | null
  photoUrls?: string[]
  createdAt: string
}

export const ratingsApi = {
  submit: (orderId: string, payload: RatingPayload) =>
    apiClient.post<{ rating: Rating }>(`/api/orders/${orderId}/rate`, payload),

  getMine: (orderId: string) =>
    apiClient.get<{ rating: Rating | null }>(`/api/orders/${orderId}/rating`),

  getForProvider: (providerId: string, params?: { page?: number; limit?: number }) =>
    apiClient.get<{ data: Rating[]; total: number }>(`/api/profile/provider/${providerId}/ratings`, { params }),
}
