import { create } from 'zustand'
import { getItem, setItem, deleteItem } from '../utils/storage'
import { queryClient } from '../utils/queryClient'
import { TOKEN_KEY } from '../api/client'
import type { User } from '../api/types'

interface AuthState {
  token: string | null
  user: User | null
  isLoading: boolean
  isHydrated: boolean

  hydrate: () => Promise<void>
  login: (token: string, user: User) => Promise<void>
  updateUser: (user: Partial<User>) => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isLoading: false,
  isHydrated: false,

  hydrate: async () => {
    try {
      const token = await getItem(TOKEN_KEY)
      const userJson = await getItem('ihz_user')
      if (token && userJson) {
        set({ token, user: JSON.parse(userJson) as User })
      }
    } catch {
      // Secure store unavailable (simulator/web) — stay logged out
    } finally {
      set({ isHydrated: true })
    }
  },

  login: async (token: string, user: User) => {
    // Guard against any leftover cache from a previous session on this device
    // (e.g. a different account was logged in) before priming a new one.
    queryClient.clear()
    await setItem(TOKEN_KEY, token)
    await setItem('ihz_user', JSON.stringify(user))
    set({ token, user })
  },

  updateUser: (partial: Partial<User>) => {
    const current = get().user
    if (!current) return
    const updated = { ...current, ...partial }
    set({ user: updated })
    setItem('ihz_user', JSON.stringify(updated)).catch(() => {})
  },

  logout: async () => {
    await deleteItem(TOKEN_KEY)
    await deleteItem('ihz_user')
    set({ token: null, user: null })
    queryClient.clear()
  },
}))
