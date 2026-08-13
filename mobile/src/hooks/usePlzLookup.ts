import { useEffect, useState } from 'react'
import { apiClient } from '../api/client'

export interface PlzPlace {
  plz: string
  city: string
  state?: string
  district?: string
}

/**
 * Resolves a 5-digit German PLZ to its city, debounced, so address forms can
 * fill the city in for the user instead of making them type it.
 *
 * Deliberately silent on failure: a lookup that doesn't resolve must never
 * block the form — the user can still type the city themselves.
 */
export function usePlzLookup(plz: string) {
  const [places, setPlaces] = useState<PlzPlace[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!/^\d{5}$/.test(plz)) {
      setPlaces([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get<{ places: PlzPlace[] }>(`/api/geo/plz/${plz}`)
        if (!cancelled) setPlaces(res.data.places ?? [])
      } catch {
        if (!cancelled) setPlaces([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [plz])

  return { places, loading, city: places[0]?.city }
}
