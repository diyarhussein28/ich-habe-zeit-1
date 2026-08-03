import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { getItem, deleteItem } from '../utils/storage'

export const TOKEN_KEY = 'ihz_auth_token'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await deleteItem(TOKEN_KEY)
      onUnauthorized?.()
    }
    return Promise.reject(error)
  },
)

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string; details?: { fieldErrors?: Record<string, string[]> } } | undefined
    if (data?.message) return data.message
    if (data?.details?.fieldErrors) {
      const msgs = Object.values(data.details.fieldErrors).flat()
      if (msgs.length) return msgs.join(', ')
    }
    if (data?.error) return data.error
    return error.message ?? 'Unbekannter Fehler'
  }
  if (error instanceof Error) return error.message
  return 'Unbekannter Fehler'
}
