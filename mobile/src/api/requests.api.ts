import { apiClient } from './client'
import type { ServiceRequest, Offer, PaginatedResponse } from './types'

export interface CreateRequestPayload {
  categoryId: string
  title: string
  description: string
  plz: string
  city: string
  scheduledAt?: string
  budget?: number
}

export interface CreateOfferPayload {
  requestId: string
  price: number
  message: string
  validUntil: string
}

export interface ListRequestsParams {
  page?: number
  limit?: number
  status?: string
  categoryId?: string
  plz?: string
}

export const requestsApi = {
  list: (params?: ListRequestsParams) =>
    apiClient.get<PaginatedResponse<ServiceRequest>>('/api/requests', { params }),

  providerFeed: (params?: { page?: number; limit?: number }) =>
    apiClient.get<{ total: number; items: ServiceRequest[] }>('/api/requests', { params: { ...params, feed: true } }),

  get: (id: string) =>
    apiClient.get<{ request: ServiceRequest }>(`/api/requests/${id}`),

  create: (payload: CreateRequestPayload) =>
    apiClient.post<{ request: ServiceRequest }>('/api/requests', payload),

  publish: (id: string) =>
    apiClient.post<ServiceRequest>(`/api/requests/${id}/publish`),

  cancel: (id: string) =>
    apiClient.delete<ServiceRequest>(`/api/requests/${id}`),

  getOffers: (requestId: string) =>
    apiClient.get<{ offers: Offer[] }>(`/api/requests/${requestId}/offers`),

  createOffer: (payload: CreateOfferPayload) =>
    apiClient.post<{ offer: Offer }>(`/api/requests/${payload.requestId}/offers`, payload),

  acceptOffer: (offerId: string) =>
    apiClient.post<{ order: { id: string } }>('/api/orders', { offerId }),

  withdrawOffer: (offerId: string) =>
    apiClient.post<Offer>(`/api/requests/offers/${offerId}/withdraw`),

  myOffers: (params?: { page?: number; limit?: number }) =>
    apiClient.get<{ offers: Offer[] }>('/api/requests/offers/mine', { params }),
}
