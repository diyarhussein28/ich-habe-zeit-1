import { useEffect, useRef, useCallback } from 'react'
import { TOKEN_KEY } from '../api/client'
import { getItem } from '../utils/storage'
import type { ChatMessage } from '../api/types'

const WS_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000')
  .replace(/^http/, 'ws')

type WsEvent =
  | { type: 'history'; messages: ChatMessage[] }
  | { type: 'message'; data: ChatMessage }
  | { type: 'error'; message: string }
  | { type: 'pong' }

interface UseChatSocketOptions {
  orderId: string
  onHistory: (messages: ChatMessage[]) => void
  onMessage: (message: ChatMessage) => void
}

export function useChatSocket({ orderId, onHistory, onMessage }: UseChatSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmounted = useRef(false)

  const connect = useCallback(async () => {
    if (unmounted.current) return

    const token = await getItem(TOKEN_KEY)
    if (!token) return

    const url = `${WS_BASE}/ws/chat?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      // Clear any pending reconnect
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsEvent
        if (msg.type === 'history') onHistory(msg.messages)
        else if (msg.type === 'message') onMessage(msg.data)
      } catch {}
    }

    ws.onclose = () => {
      wsRef.current = null
      if (!unmounted.current) {
        // Reconnect after 3s
        reconnectTimer.current = setTimeout(connect, 3000)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [orderId, onHistory, onMessage])

  // Keep a stable send function
  const sendMessage = useCallback((content: string) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'send', content }))
      return true
    }
    return false
  }, [])

  useEffect(() => {
    unmounted.current = false
    connect()

    return () => {
      unmounted.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  const isConnected = () => wsRef.current?.readyState === WebSocket.OPEN

  return { sendMessage, isConnected }
}
