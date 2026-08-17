import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { getItem, deleteItem } from '../utils/storage'
import { captureException } from '../utils/sentry'

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

    // Only report unexpected failures (server bugs), not routine 4xx validation/auth errors.
    if (!error.response || error.response.status >= 500) {
      captureException(error, { extra: { url: config?.url, method: config?.method } })
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

// Backend routes largely return raw `{ error: 'SOME_CODE' }` machine codes rather
// than translated messages. Without this map those codes leak straight to the UI
// (e.g. a login screen alert reading "INVALID_CREDENTIALS"). Keep in sync with the
// `throw new Error('CODE')` codes across backend/src/services and routes.
const ERROR_CODE_MESSAGES: Record<string, string> = {
  ACCOUNT_SUSPENDED: 'Dein Konto wurde gesperrt. Bitte kontaktiere den Support.',
  ACTIVE_ORDERS_EXIST: 'Das ist wegen laufender Aufträge aktuell nicht möglich.',
  ADDRESS_NOT_FOUND: 'Adresse nicht gefunden.',
  AI_AUTH_FAILED: 'Der Assistent ist derzeit nicht verfügbar.',
  AI_BAD_RESPONSE: 'Der Assistent konnte keinen Vorschlag erstellen. Bitte versuche es erneut.',
  AI_EMPTY_RESPONSE: 'Der Assistent konnte keinen Vorschlag erstellen. Bitte versuche es erneut.',
  AI_REQUEST_FAILED: 'Der Assistent ist derzeit nicht verfügbar.',
  ALREADY_PROVIDER: 'Du bist bereits als Dienstleister registriert.',
  ALREADY_RATED: 'Du hast diesen Auftrag bereits bewertet.',
  ALREADY_RESOLVED: 'Dieser Fall wurde bereits gelöst.',
  ALREADY_RESPONDED: 'Du hast bereits geantwortet.',
  BLACKLISTED: 'Diese Aktion ist nicht möglich.',
  CANNOT_CANCEL_AT_THIS_STAGE: 'Der Auftrag kann in diesem Status nicht storniert werden.',
  CANNOT_COUNTER_OWN_OFFER: 'Du kannst kein Gegenangebot zu deinem eigenen Angebot machen.',
  CANNOT_DECLINE_OWN_OFFER: 'Du kannst dein eigenes Angebot nicht ablehnen.',
  CATEGORY_NOT_AVAILABLE_IN_AREA: 'Diese Kategorie ist in deiner Region nicht verfügbar.',
  CATEGORY_NOT_FOUND: 'Kategorie nicht gefunden.',
  CATEGORY_VERIFICATION_REQUIRED: 'Für diese Kategorie ist eine Verifizierung erforderlich.',
  CHAT_NOT_FOUND: 'Chat nicht gefunden.',
  DESCRIPTION_TOO_SHORT: 'Die Beschreibung ist zu kurz.',
  DEVICE_BANNED: 'Dieses Gerät wurde gesperrt.',
  DIRECT_INVITE_ONLY: 'Dieser Auftrag ist nur per Direkteinladung verfügbar.',
  DISPUTE_ALREADY_OPEN: 'Für diesen Auftrag läuft bereits ein Streitfall.',
  DISPUTE_NOT_FOUND: 'Streitfall nicht gefunden.',
  DISPUTE_WINDOW_CLOSED: 'Das Zeitfenster für einen Streitfall ist abgelaufen.',
  EMAIL_TAKEN: 'Diese E-Mail-Adresse wird bereits verwendet.',
  EVIDENCE_LIMIT_EXCEEDED: 'Maximale Anzahl an Nachweisen erreicht.',
  FILE_TOO_LARGE: 'Die Datei ist zu groß.',
  FORBIDDEN: 'Du hast keine Berechtigung für diese Aktion.',
  INCOMPLETE_DOCUMENTS: 'Bitte lade alle erforderlichen Dokumente hoch.',
  INVALID_CATEGORY: 'Ungültige Kategorie.',
  INVALID_CHALLENGE: 'Bestätigung ungültig oder abgelaufen. Bitte erneut anmelden.',
  INVALID_CODE: 'Der eingegebene Code ist ungültig.',
  INVALID_CREDENTIALS: 'E-Mail oder Passwort ist falsch.',
  INVALID_MIME_TYPE: 'Dieser Dateityp wird nicht unterstützt.',
  INVALID_OR_EXPIRED_TOKEN: 'Der Link ist ungültig oder abgelaufen.',
  INVALID_PRICE: 'Bitte gib einen gültigen Preis ein.',
  INVALID_SCORE: 'Ungültige Bewertung.',
  INVALID_STATE: 'Diese Aktion ist im aktuellen Status nicht möglich.',
  INVOICES_ALREADY_GENERATED: 'Rechnungen wurden bereits erstellt.',
  INVOICE_NOT_FOUND: 'Rechnung nicht gefunden.',
  IP_BANNED: 'Zugriff von dieser Verbindung wurde gesperrt.',
  MFA_NOT_ENABLED: 'Zwei-Faktor-Authentifizierung ist nicht aktiviert.',
  MFA_SETUP_NOT_STARTED: 'Zwei-Faktor-Einrichtung wurde nicht gestartet.',
  NOT_ALLOWED: 'Diese Aktion ist nicht erlaubt.',
  NOT_FOUND: 'Nicht gefunden.',
  NO_STRIPE_CUSTOMER: 'Es ist noch keine Zahlungsmethode hinterlegt.',
  OFFER_ALREADY_SUBMITTED: 'Du hast für diesen Auftrag bereits ein Angebot abgegeben.',
  OFFER_EXPIRED: 'Dieses Angebot ist abgelaufen.',
  OFFER_NOT_FOUND: 'Angebot nicht gefunden.',
  OFFER_NOT_PENDING: 'Über dieses Angebot wurde bereits entschieden.',
  OPENER_CANNOT_RESPOND: 'Du kannst nicht auf deinen eigenen Streitfall antworten.',
  ORDER_NOT_COMPLETED: 'Der Auftrag wurde noch nicht abgeschlossen.',
  ORDER_NOT_FOUND: 'Auftrag nicht gefunden.',
  ORDER_NOT_RELEASED: 'Die Zahlung wurde noch nicht freigegeben.',
  PARENT_OFFER_NOT_FOUND: 'Ursprüngliches Angebot nicht gefunden.',
  PARENT_OFFER_NOT_PENDING: 'Über das ursprüngliche Angebot wurde bereits entschieden.',
  PHONE_TAKEN: 'Diese Telefonnummer wird bereits verwendet.',
  PROFILE_NOT_FOUND: 'Profil nicht gefunden.',
  PROVIDER_NOT_FOUND: 'Dienstleister nicht gefunden.',
  RATE_LIMITED: 'Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.',
  REQUEST_EXPIRED: 'Dieser Auftrag ist abgelaufen.',
  REQUEST_NOT_FOUND: 'Auftrag nicht gefunden.',
  REQUEST_NOT_OPEN: 'Dieser Auftrag ist nicht mehr offen.',
  REQUEST_NO_LONGER_OPEN: 'Dieser Auftrag ist nicht mehr offen.',
  SLUG_TAKEN: 'Diese Adresse wird bereits verwendet.',
  TICKET_CLOSED: 'Dieses Ticket wurde bereits geschlossen.',
  USER_NOT_FOUND: 'Nutzer nicht gefunden.',
  VALIDATION_ERROR: 'Bitte überprüfe deine Eingaben.',
}

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string; details?: { fieldErrors?: Record<string, string[]> } } | undefined
    if (data?.message) return data.message
    if (data?.details?.fieldErrors) {
      const msgs = Object.values(data.details.fieldErrors).flat()
      if (msgs.length) return msgs.join(', ')
    }
    if (data?.error) return ERROR_CODE_MESSAGES[data.error] ?? data.error

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
