/**
 * Input masks/formatters shared by every form, so fields behave the same way
 * everywhere instead of each screen re-inventing (or skipping) the handling.
 */

/**
 * Formats a German date as the user types: "01091990" → "01.09.1990".
 * Dots are inserted automatically and typed dots are ignored, so both
 * "01.09.1990" and "01091990" produce the same result. Deleting works
 * naturally because we always re-derive from the digits.
 */
export function formatGermanDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
}

/**
 * Parses "TT.MM.JJJJ" into an ISO date string.
 * Returns undefined for empty input, null for input that is present but not a
 * real calendar date — letting callers tell "nothing entered" apart from
 * "entered something wrong".
 */
export function parseGermanDate(input: string): string | undefined | null {
  const trimmed = input.trim()
  if (!trimmed) return undefined

  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed)
  if (!match) return null

  const [, dd, mm, yyyy] = match
  const day = Number(dd)
  const month = Number(mm)
  const year = Number(yyyy)

  const date = new Date(Date.UTC(year, month - 1, day))
  // Round-trip check rejects impossible dates like 31.02. that Date would
  // silently roll over into March.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return date.toISOString()
}

/** True when the date is a plausible birth date: in the past, and age <= 120. */
export function isPlausibleBirthDate(iso: string): boolean {
  const date = new Date(iso)
  const now = new Date()
  if (date > now) return false
  const maxAge = new Date()
  maxAge.setFullYear(maxAge.getFullYear() - 120)
  return date > maxAge
}

/** Keeps only digits, capped at 5 — German postal codes. */
export function formatPlzInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 5)
}

/**
 * Normalises a German phone number toward E.164 as the user types:
 * leading "0" becomes "+49", and everything but digits and a leading "+" is
 * dropped. Kept permissive — the backend does the authoritative validation.
 */
export function formatPhoneInput(raw: string): string {
  let value = raw.replace(/[^\d+]/g, '')
  value = value.replace(/(?!^)\+/g, '')
  if (value.startsWith('00')) value = `+${value.slice(2)}`
  else if (value.startsWith('0')) value = `+49${value.slice(1)}`
  return value.slice(0, 16)
}
