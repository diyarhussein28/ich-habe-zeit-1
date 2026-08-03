import axios, { AxiosError } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('ihz-admin-auth')
  if (stored) {
    try {
      const { state } = JSON.parse(stored) as { state: { token: string | null } }
      if (state.token) config.headers.Authorization = `Bearer ${state.token}`
    } catch {}
  }
  return config
})

let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) onUnauthorized?.()
    return Promise.reject(error)
  },
)

export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { message?: string } | undefined
    return d?.message ?? err.message
  }
  return err instanceof Error ? err.message : 'Unbekannter Fehler'
}
