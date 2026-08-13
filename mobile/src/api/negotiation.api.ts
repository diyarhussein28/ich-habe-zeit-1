import { apiClient } from './client'

export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED' | 'COUNTERED'
export type ChatMessageType = 'TEXT' | 'OFFER' | 'SYSTEM'

export interface NegotiationOffer {
  id: string
  status: OfferStatus
  proposedPrice: number
  scopeOfWork: string
  proposedDate: string
  estimatedDurationHours?: number | null
  validUntil: string
  proposedByUserId?: string | null
  parentOfferId?: string | null
}

export interface NegotiationMessage {
  id: string
  chatId: string
  senderId: string
  content: string
  isSystem: boolean
  messageType: ChatMessageType
  offerId?: string | null
  offer?: NegotiationOffer | null
  createdAt: string
}

export interface Negotiation {
  chatId: string
  messages: NegotiationMessage[]
  activeOffer: NegotiationOffer | null
  viewerIsCustomer: boolean
}

export interface ProposeOfferInput {
  requestId: string
  providerId: string
  proposedPrice: number
  scopeOfWork: string
  estimatedDurationDays?: number
  validHours?: number
  parentOfferId?: string
}

export const negotiationApi = {
  get: (requestId: string, providerId: string) =>
    apiClient.get<Negotiation>(`/api/negotiations/${requestId}/${providerId}`),

  propose: (input: ProposeOfferInput) =>
    apiClient.post<{ offer: NegotiationOffer }>('/api/negotiations/offers', input),

  accept: (offerId: string) =>
    apiClient.post<{ order: { id: string } }>(`/api/negotiations/offers/${offerId}/accept`),

  decline: (offerId: string) =>
    apiClient.post<{ declined: boolean }>(`/api/negotiations/offers/${offerId}/decline`),

  withdraw: (offerId: string) =>
    apiClient.post<{ withdrawn: boolean }>(`/api/negotiations/offers/${offerId}/withdraw`),
}
