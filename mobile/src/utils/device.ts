import { getItem, setItem } from './storage'

const DEVICE_ID_KEY = 'ihz_device_id'

let cachedDeviceId: string | null = null

function generateId(): string {
  // Not a security secret — just a stable per-install fingerprint for
  // "have we seen this device before" login/registration checks.
  const random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  return `dev-${Date.now().toString(36)}-${random}`
}

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId

  const existing = await getItem(DEVICE_ID_KEY)
  if (existing) {
    cachedDeviceId = existing
    return existing
  }

  const id = generateId()
  await setItem(DEVICE_ID_KEY, id)
  cachedDeviceId = id
  return id
}
