import { apiClient } from './client'
import type { User } from './types'

export interface FullProfile extends User {
  phone?: string
  dateOfBirth?: string
  profilePhotoUrl?: string
}

export interface ProfileCategory {
  id: string
  name: string
  icon?: string | null
  isVerified: boolean
}

export interface Address {
  id: string
  label: string
  street: string
  city: string
  plz: string
  country: string
  lat?: number
  lon?: number
  isDefault: boolean
}

export interface NotificationSettings {
  pushEnabled: boolean
  emailEnabled: boolean
  smsEnabled: boolean
  newOfferPush: boolean
  newOfferEmail: boolean
  chatMessagePush: boolean
  marketingEmail: boolean
}

export type PricingModel = 'PER_HOUR' | 'FIXED_PRICE' | 'CUSTOM_QUOTE'

export interface ServiceArea {
  id: string
  homePlz: string
  radiusKm: number
  plzList: string[]
  lat?: number
  lon?: number
}

export interface ProviderProfileFull {
  id: string
  bio?: string
  servicePhotoUrls: string[]
  pricingModel: PricingModel
  languages: string[]
  isAvailable: boolean
  averageRating: number
  totalReviews: number
  workingHours?: Record<string, { open: string; close: string; closed?: boolean }>
  isKleinunternehmer: boolean
  vatNumber?: string
  legalName?: string
  taxId?: string
  serviceAreas: ServiceArea[]
  providerCategories: Array<{ category: { id: string; name: string; icon?: string }; isVerified: boolean }>
}

export interface KleinunternehmerStatus {
  isKleinunternehmer: boolean
  revenueThisYear: number
  threshold: number
  approachingThreshold: boolean
  exceededThreshold: boolean
}

export const profileApi = {
  getMe: () =>
    apiClient.get<{ profile: FullProfile }>('/api/profile'),

  update: (data: { displayName?: string; profilePhotoUrl?: string; dateOfBirth?: string }) =>
    apiClient.patch<{ profile: FullProfile }>('/api/profile', data),

  getProviderCategories: () =>
    apiClient.get<{ categories: ProfileCategory[] }>('/api/profile/provider/categories'),

  setProviderCategories: (categoryIds: string[]) =>
    apiClient.put<{ categories: ProfileCategory[] }>('/api/profile/provider/categories', { categoryIds }),

  deleteAccount: () =>
    apiClient.delete<{ message: string }>('/api/profile'),

  // ── Addresses ────────────────────────────────────────────────────────────
  listAddresses: () =>
    apiClient.get<{ addresses: Address[] }>('/api/profile/addresses'),

  addAddress: (data: Omit<Address, 'id' | 'country' | 'isDefault'> & { isDefault?: boolean }) =>
    apiClient.post<{ address: Address }>('/api/profile/addresses', data),

  updateAddress: (id: string, data: Partial<Omit<Address, 'id'>>) =>
    apiClient.patch<{ address: Address }>(`/api/profile/addresses/${id}`, data),

  deleteAddress: (id: string) =>
    apiClient.delete(`/api/profile/addresses/${id}`),

  // ── Notification settings ──────────────────────────────────────────────
  getNotificationSettings: () =>
    apiClient.get<{ settings: NotificationSettings }>('/api/profile/notifications'),

  updateNotificationSettings: (data: Partial<NotificationSettings>) =>
    apiClient.patch<{ settings: NotificationSettings }>('/api/profile/notifications', data),

  // ── Provider profile ────────────────────────────────────────────────────
  getProviderProfile: () =>
    apiClient.get<{ profile: ProviderProfileFull }>('/api/profile/provider'),

  updateProviderProfile: (data: Partial<{
    bio: string
    servicePhotoUrls: string[]
    pricingModel: PricingModel
    languages: string[]
    workingHours: Record<string, { open: string; close: string; closed?: boolean }>
    isAvailable: boolean
  }>) =>
    apiClient.patch<{ profile: ProviderProfileFull }>('/api/profile/provider', data),

  updateTaxInfo: (data: { isKleinunternehmer: boolean; vatNumber?: string; legalName: string; taxId?: string }) =>
    apiClient.patch<{ profile: ProviderProfileFull }>('/api/profile/provider/tax', data),

  setServiceAreas: (areas: Array<{ homePlz: string; radiusKm: number; plzList?: string[] }>) =>
    apiClient.put<{ areas: ServiceArea[] }>('/api/profile/provider/service-areas', { areas }),

  submitCategoryVerificationDocs: (categoryId: string, docUrls: string[]) =>
    apiClient.post(`/api/profile/provider/categories/${categoryId}/verification-docs`, { docUrls }),

  getKleinunternehmerStatus: () =>
    apiClient.get<KleinunternehmerStatus>('/api/invoices/kleinunternehmer-status'),
}
