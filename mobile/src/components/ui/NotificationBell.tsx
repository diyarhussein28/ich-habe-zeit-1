import React from 'react'
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { notificationsApi } from '../../api/notifications.api'
import { useAuthStore } from '../../store/auth.store'
import { colors, fontSize, fontWeight, radius, spacing } from '../../constants/theme'

export function NotificationBell() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  const { data } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => notificationsApi.unreadCount().then((r) => r.data.unreadCount),
    enabled: !!user,
    refetchInterval: 30_000,
  })

  const unreadCount = data ?? 0

  return (
    <TouchableOpacity onPress={() => router.push('/notifications')} style={styles.btn} hitSlop={8}>
      <Text style={styles.icon}>🔔</Text>
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 18 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 10, fontWeight: fontWeight.bold, color: colors.textInverse },
})
