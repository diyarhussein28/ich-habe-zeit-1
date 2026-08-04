import { processAutoReleases } from '../services/order.service.js'
import { expireOldRequests } from '../services/request.service.js'

const INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

async function runOnce() {
  try {
    const released = await processAutoReleases()
    if (released.processed > 0) {
      console.log(`[scheduler] auto-released ${released.processed} order(s), ${released.failed} failed`)
    }
  } catch (err) {
    console.error('[scheduler] processAutoReleases failed:', err)
  }

  try {
    const expired = await expireOldRequests()
    if (expired.expired > 0) {
      console.log(`[scheduler] expired ${expired.expired} request(s)`)
    }
  } catch (err) {
    console.error('[scheduler] expireOldRequests failed:', err)
  }
}

export function startScheduledJobs() {
  console.log(`[scheduler] started — auto-release and request-expiry run every ${INTERVAL_MS / 60000} min`)
  runOnce()
  const timer = setInterval(runOnce, INTERVAL_MS)
  timer.unref()
  return timer
}
