import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { getItem, deleteItem } from '../utils/storage'

export const TOKEN_KEY = 'ihz_auth_token'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

/** Exposed so the connection-diagnostic screen can show which server it's talking to. */
export const API_BASE_URL = BASE_URL

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
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

// Retry GETs once on a pure connection failure — flaky mobile networks drop the
// first request routinely (handover between cells/WiFi). Only GETs: replaying a
// POST could double-create an account or an offer.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await deleteItem(TOKEN_KEY)
      onUnauthorized?.()
      return Promise.reject(error)
    }

    const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    const isConnectionFailure = !error.response
    const isGet = (config?.method ?? 'get').toLowerCase() === 'get'

    if (config && isConnectionFailure && isGet && !config._retried) {
      config._retried = true
      await new Promise((resolve) => setTimeout(resolve, 800))
      return apiClient.request(config)
    }

    return Promise.reject(error)
  },
)

export type NetworkFailureKind = 'timeout' | 'unreachable' | 'server' | 'none'

/**
 * Classifies why a request failed. Axios reports every connection-level problem
 * as the single opaque string "Network Error", which tells a user nothing and
 * makes remote debugging impossible — this splits it into cases we can act on.
 */
export function classifyNetworkFailure(error: unknown): NetworkFailureKind {
  if (!axios.isAxiosError(error)) return 'none'
  if (error.code === 'ECONNABORTED' || error.message?.toLowerCase().includes('timeout')) return 'timeout'
  if (!error.response) return 'unreachable'
  if (error.response.status >= 500) return 'server'
  return 'none'
}

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string; details?: { fieldErrors?: Record<string, string[]> } } | undefined
    if (data?.message) return data.message
    if (data?.details?.fieldErrors) {
      const msgs = Object.values(data.details.fieldErrors).flat()
      if (msgs.length) return msgs.join(', ')
    }
    if (data?.error) return data.error

    switch (classifyNetworkFailure(error)) {
      case 'timeout':
        return 'Zeitüberschreitung — der Server antwortet gerade nicht. Bitte prüfe deine Internetverbindung und versuche es erneut.'
      case 'unreachable':
        return 'Keine Verbindung zum Server möglich. Bitte prüfe deine Internetverbindung (WLAN/Mobilfunk) und versuche es erneut.'
      case 'server':
        return 'Auf dem Server ist ein Fehler aufgetreten. Bitte versuche es in einem Moment erneut.'
    }

    return error.message ?? 'Unbekannter Fehler'
  }
  if (error instanceof Error) return error.message
  return 'Unbekannter Fehler'
}

export interface ConnectionDiagnostic {
  ok: boolean
  apiUrl: string
  /** Round-trip time in ms for the health check, when it succeeded. */
  latencyMs?: number
  kind?: NetworkFailureKind
  detail: string
}

/**
 * Probes the API's /health endpoint and reports a human-readable result.
 * Surfaced from the login screen when sign-in fails for network reasons, so a
 * tester can tell us *why* it failed instead of just "Network Error".
 */
export async function runConnectionDiagnostic(): Promise<ConnectionDiagnostic> {
  const startedAt = Date.now()
  try {
    await axios.get(`${BASE_URL}/health`, { timeout: 15000 })
    return {
      ok: true,
      apiUrl: BASE_URL,
      latencyMs: Date.now() - startedAt,
      detail: 'Server erreichbar. Die Anmeldedaten oder die Anfrage selbst waren das Problem, nicht die Verbindung.',
    }
  } catch (error) {
    const kind = classifyNetworkFailure(error)
    const detail =
      kind === 'timeout'
        ? 'Der Server hat nicht rechtzeitig geantwortet. Das deutet auf eine sehr langsame oder blockierte Verbindung hin.'
        : kind === 'server'
          ? 'Der Server ist erreichbar, meldet aber einen internen Fehler.'
          : 'Der Server ist von diesem Gerät aus nicht erreichbar. Häufige Ursachen: kein Internet, ein VPN, ein privater DNS-Server, oder ein Firewall-/Jugendschutzfilter im WLAN. Teste dieselbe Adresse im Browser dieses Geräts.'
    return { ok: false, apiUrl: BASE_URL, kind, detail }
  }
}
