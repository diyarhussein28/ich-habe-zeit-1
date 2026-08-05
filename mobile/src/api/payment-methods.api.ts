import { apiClient } from './client'

export interface SavedPaymentMethod {
  id: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  isDefault: boolean
}

export const paymentMethodsApi = {
  createSetupIntent: () =>
    apiClient.post<{ clientSecret: string; customerId: string }>('/api/stripe/payment-methods/setup-intent'),

  list: () =>
    apiClient.get<{ paymentMethods: SavedPaymentMethod[]; defaultPaymentMethodId: string | null }>('/api/stripe/payment-methods'),

  remove: (id: string) =>
    apiClient.delete<{ message: string }>(`/api/stripe/payment-methods/${id}`),

  setDefault: (id: string) =>
    apiClient.patch<{ message: string }>(`/api/stripe/payment-methods/${id}/default`),
}
