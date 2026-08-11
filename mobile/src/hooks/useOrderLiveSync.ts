import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TOKEN_KEY } from '../api/client'
import { getItem } from '../utils/storage'

const WS_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000')
  .replace(/^http/, 'ws')

type LiveEvent = { type: 'dispute_updated'; disputeId: string }

// Reuses the existing per-order chat WebSocket room purely to learn "something
// about this order changed on the server" (e.g. an admin assigned/recommended/
// resolved a dispute) — without it, screens only refresh on manual pull-to-
// refresh or a full app reload, which is what made admin actions feel like
// they "didn't show up" in the app.
export function useOrderLiveSync(orderId: string | undefined) {
  const qc = useQueryClient()
  const unmounted = useRef(false)

  useEffect(() => {
    if (!orderId) return

    unmounted.current = false
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    async function connect() {
      if (unmounted.current) return
      const token = await getItem(TOKEN_KEY)
      if (!token || unmounted.current) return

      const url = `${WS_BASE}/ws/chat?orderId=${encodeURIComponent(orderId as string)}&token=${encodeURIComponent(token)}`
      ws = new WebSocket(url)

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as LiveEvent
          if (msg.type === 'dispute_updated') {
            qc.invalidateQueries({ queryKey: ['dispute', orderId] })
            qc.invalidateQueries({ queryKey: ['order', orderId] })
          }
        } catch {}
      }

      ws.onclose = () => {
        ws = null
        if (!unmounted.current) reconnectTimer = setTimeout(connect, 4000)
      }

      ws.onerror = () => ws?.close()
    }

    connect()

    return () => {
      unmounted.current = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [orderId, qc])
}
