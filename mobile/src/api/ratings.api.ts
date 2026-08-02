import { apiClient } from './client'

export interface RatingPayload {
  rating: number
  comment?: string
}

export interface Rating {
  id: string
  orderId: string
  raterId: string
  ratedId: string
  rating: number
  comment?: string
  createdAt: string
}

export const ratingsApi = {
  submit: (orderId: string, payload: RatingPayload) =>
    apiClient.post<Rating>(`/api/orders/${orderId}/rate`, payload),

  getForProvider: (providerId: string, params?: { page?: number; limit?: number }) =>
    apiClient.get<{ data: Rating[]; total: number }>(`/api/profile/provider/${providerId}/ratings`, { params }),
}
