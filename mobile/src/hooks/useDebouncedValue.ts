import { useEffect, useState } from 'react'

/**
 * Delays propagating a rapidly-changing value (typically a search box) so
 * dependent queries fire once the user pauses rather than on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
