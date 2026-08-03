import { apiClient } from './client'
import type { VerificationStatus } from './types'

export type KycDocumentType = 'ID_FRONT' | 'ID_BACK' | 'SELFIE_WITH_ID'

export interface KycDocument {
  id: string
  type: KycDocumentType
  fileUrl: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt: string
}

export const kycApi = {
  getDocuments: () =>
    apiClient.get<KycDocument[]>('/api/kyc/documents'),

  uploadDocument: (type: KycDocumentType, uri: string, mimeType: string) => {
    const ext = mimeType.split('/')[1] ?? 'jpg'
    const formData = new FormData()
    formData.append('type', type)
    formData.append('file', { uri, type: mimeType, name: `kyc_${type.toLowerCase()}.${ext}` } as any)
    return apiClient.post<KycDocument>('/api/kyc/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  deleteDocument: (id: string) =>
    apiClient.delete(`/api/kyc/documents/${id}`),

  submitForReview: () =>
    apiClient.post<{ verificationStatus: VerificationStatus }>('/api/kyc/submit'),
}
