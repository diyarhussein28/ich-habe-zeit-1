import { QueryClient } from '@tanstack/react-query'

// Single shared instance so it can be cleared from outside the component tree
// (e.g. auth.store's logout) — without this, switching accounts on the same
// device would keep serving the previous user's cached data.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
})
