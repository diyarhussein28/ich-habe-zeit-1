// In-memory sliding-window rate limiter, keyed by an arbitrary string
// (e.g. `${ip}:${type}`). Mirrors the pattern used for chat rate limiting.

const windows = new Map<string, number[]>()

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now()
  const timestamps = (windows.get(key) ?? []).filter((t) => now - t < windowMs)

  if (timestamps.length >= maxRequests) {
    windows.set(key, timestamps)
    return false
  }

  timestamps.push(now)
  windows.set(key, timestamps)
  return true
}
