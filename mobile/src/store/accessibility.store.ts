import { create } from 'zustand'
import { getItem, setItem } from '../utils/storage'

const STORAGE_KEY = 'ihz_accessibility'

interface AccessibilityState {
  largeText: boolean
  highContrast: boolean
  hydrate: () => Promise<void>
  setLargeText: (value: boolean) => void
  setHighContrast: (value: boolean) => void
}

async function persist(state: { largeText: boolean; highContrast: boolean }) {
  await setItem(STORAGE_KEY, JSON.stringify(state))
}

export const useAccessibilityStore = create<AccessibilityState>((set, get) => ({
  largeText: false,
  highContrast: false,

  hydrate: async () => {
    try {
      const raw = await getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { largeText?: boolean; highContrast?: boolean }
        set({ largeText: !!parsed.largeText, highContrast: !!parsed.highContrast })
      }
    } catch {
      // ignore — defaults stand
    }
  },

  setLargeText: (value) => {
    set({ largeText: value })
    persist({ largeText: value, highContrast: get().highContrast })
  },

  setHighContrast: (value) => {
    set({ highContrast: value })
    persist({ largeText: get().largeText, highContrast: value })
  },
}))
