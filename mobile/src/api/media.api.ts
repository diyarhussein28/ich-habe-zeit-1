import { apiClient } from './client'

export type MediaContext = 'PROFILE_PHOTO' | 'SERVICE_PHOTO' | 'REQUEST_PHOTO' | 'COMPLETION_PHOTO' | 'DISPUTE_EVIDENCE' | 'REVIEW_PHOTO'

export const mediaApi = {
  upload: async (context: MediaContext, uri: string, mimeType = 'image/jpeg'): Promise<string> => {
    const form = new FormData()
    form.append('context', context)
    form.append('file', {
      uri,
      name: `upload.${mimeType === 'image/png' ? 'png' : 'jpg'}`,
      type: mimeType,
    } as unknown as Blob)

    const { data } = await apiClient.post<{ url: string }>('/api/media/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.url
  },
}
