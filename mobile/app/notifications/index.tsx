import React from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsApi, type AppNotification } from '../../src/api/notifications.api'
import { routeForNotification } from '../../src/hooks/usePushNotifications'
import { useAuthStore } from '../../src/store/auth.store'
import { AnimatedEntrance } from '../../src/components/ui/motion'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'
import { formatRelativeTime } from '../../src/utils/date'

const TYPE_EMOJI: Record<string, string> = {
  NEW_OFFER: '📨',
  OFFER_ACCEPTED: '✅',
  ORDER_UPDATE: '📦',
  PAYMENT_CAPTURED: '💳',
  RELEASE_REMINDER: '⏰',
  APPOINTMENT_REMINDER: '📅',
  NEW_MESSAGE: '💬',
  NEW_REQUEST_MESSAGE: '💬',
  DISPUTE_OPENED: '⚠️',
  DISPUTE_UPDATE: '⚠️',
  INVOICE_ISSUED: '🧾',
  ACCOUNT_STATUS: 'ℹ️',
  KYC_VERIFIED: '🪪',
  KYC_REJECTED: '🪪',
  KYC_RESUBMISSION: '🪪',
}

export default function NotificationsScreen() {
  const router = useRouter()
  const qc = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list({ limit: 50 }).then((r) => r.data),
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const notifications = data?.notifications ?? []
  const unreadCount = data?.unreadCount ?? 0

  function handlePress(n: AppNotification) {
    if (!n.readAt) markReadMutation.mutate(n.id)
    const route = routeForNotification(
      { type: n.type, orderId: n.orderId ?? undefined, requestId: n.requestId ?? undefined, providerId: n.providerId ?? undefined },
      role,
    )
    if (route) router.push(route as any)
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Benachrichtigungen</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={() => markAllReadMutation.mutate()}>
            <Text style={styles.markAllBtn}>Alle lesen</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 70 }} />
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔔</Text>
              <Text style={styles.emptyTitle}>Keine Benachrichtigungen</Text>
              <Text style={styles.emptyText}>Hier siehst du, was in deinen Aufträgen passiert.</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <AnimatedEntrance index={index}>
            <NotificationRow notification={item} onPress={() => handlePress(item)} />
          </AnimatedEntrance>
        )}
      />
    </SafeAreaView>
  )
}

function NotificationRow({ notification, onPress }: { notification: AppNotification; onPress: () => void }) {
  const unread = !notification.readAt
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.row, unread && styles.rowUnread]}>
      <Text style={styles.rowEmoji}>{TYPE_EMOJI[notification.type] ?? '🔔'}</Text>
      <View style={styles.rowContent}>
        <View style={styles.rowTitleLine}>
          <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]} numberOfLines={1}>
            {notification.title}
          </Text>
          {unread ? <View style={styles.dot} /> : null}
        </View>
        <Text style={styles.rowBody} numberOfLines={2}>{notification.body}</Text>
        <Text style={styles.rowTime}>{formatRelativeTime(notification.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: { fontSize: fontSize.md, color: colors.primary },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  markAllBtn: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary },
  list: { paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowUnread: { backgroundColor: colors.primaryLight },
  rowEmoji: { fontSize: 24, marginRight: spacing.md, marginTop: 2 },
  rowContent: { flex: 1 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text },
  rowTitleUnread: { fontWeight: fontWeight.bold },
  dot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.primary, marginLeft: spacing.sm },
  rowBody: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2, lineHeight: 19 },
  rowTime: { fontSize: fontSize.xs, color: colors.textDisabled, marginTop: spacing.xs },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
})
