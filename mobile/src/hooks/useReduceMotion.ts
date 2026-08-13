import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Tracks the OS "reduce motion" setting.
 *
 * Motion is an accessibility concern, not just decoration: vestibular
 * disorders make large slide/scale transitions genuinely unpleasant. Every
 * animation in the app checks this and degrades to an instant state change.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let mounted = true

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (mounted) setReduceMotion(enabled) })
      .catch(() => {})

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled)
    })

    return () => {
      mounted = false
      sub.remove()
    }
  }, [])

  return reduceMotion
}
