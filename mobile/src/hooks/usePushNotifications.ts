import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useAuthStore } from '../store/auth.store'
import { notificationsApi } from '../api/notifications.api'

// Show alerts while app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

type NotificationData = {
  type?: string
  orderId?: string
  requestId?: string
}

function routeForNotification(data: NotificationData, role?: string) {
  switch (data.type) {
    case 'NEW_OFFER':
      return data.requestId ? `/(customer)/requests/${data.requestId}` : null
    case 'OFFER_ACCEPTED':
      return data.orderId ? `/(provider)/orders/${data.orderId}` : null
    case 'ORDER_UPDATE':
    case 'PAYMENT_CAPTURED':
    case 'RELEASE_REMINDER':
      if (!data.orderId) return null
      return role === 'PROVIDER'
        ? `/(provider)/orders/${data.orderId}`
        : `/(customer)/orders/${data.orderId}`
    case 'NEW_MESSAGE':
      return data.orderId ? `/chat/${data.orderId}` : null
    case 'DISPUTE_UPDATE':
      if (!data.orderId) return null
      return role === 'PROVIDER'
        ? `/(provider)/orders/${data.orderId}`
        : `/(customer)/orders/${data.orderId}`
    case 'KYC_VERIFIED':
    case 'KYC_REJECTED':
    case 'KYC_RESUBMISSION':
      return '/(provider)/profile/kyc'
    default:
      return null
  }
}

async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Standard',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1A56DB',
    sound: 'default',
  })
}

async function getExpoPushToken(): Promise<string | null> {
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )
    return token
  } catch {
    // No EAS project configured — expected in bare development
    return null
  }
}

export function usePushNotifications() {
  const { user, isHydrated } = useAuthStore()
  const tokenRef = useRef<string | null>(null)
  const foregroundSub = useRef<Notifications.EventSubscription | null>(null)
  const responseSub = useRef<Notifications.EventSubscription | null>(null)

  // Register when user logs in
  useEffect(() => {
    if (!isHydrated || !user) return

    let cancelled = false

    async function register() {
      await setupAndroidChannel()

      const { status: existing } = await Notifications.getPermissionsAsync()
      let status = existing
      if (existing !== 'granted') {
        const { status: requested } = await Notifications.requestPermissionsAsync()
        status = requested
      }
      if (status !== 'granted' || cancelled) return

      const token = await getExpoPushToken()
      if (!token || cancelled) return

      tokenRef.current = token
      try {
        await notificationsApi.registerToken(token, Platform.OS as 'ios' | 'android')
      } catch {
        // Backend not yet running — safe to ignore
      }
    }

    register()
    return () => { cancelled = true }
  }, [isHydrated, user?.id])

  // Unregister on logout
  useEffect(() => {
    if (isHydrated && !user && tokenRef.current) {
      notificationsApi.unregisterToken(tokenRef.current).catch(() => {})
      tokenRef.current = null
    }
  }, [isHydrated, user])

  // Notification listeners
  useEffect(() => {
    // Foreground: badge update only (alert already shown by handler above)
    foregroundSub.current = Notifications.addNotificationReceivedListener(() => {
      // Could update in-app badge / query invalidation here
    })

    // Tap: navigate to the relevant screen
    responseSub.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as NotificationData
      const role = useAuthStore.getState().user?.role
      const route = routeForNotification(data, role)
      if (route) router.push(route as any)
    })

    return () => {
      foregroundSub.current?.remove()
      responseSub.current?.remove()
    }
  }, [])
}
