import { apiClient } from './client'

export interface LegalDocument {
  type: string
  title: string
  content: string
  version: string
  publishedAt: string | null
}

export const legalApi = {
  list: () => apiClient.get<{ documents: LegalDocument[] }>('/api/legal-docs'),

  get: (type: string) => apiClient.get<{ document: LegalDocument }>(`/api/legal-docs/${type}`),
}
