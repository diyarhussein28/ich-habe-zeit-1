import React from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ordersApi } from '../../../src/api/orders.api'
import { Card } from '../../../src/components/ui/Card'
import { colors, spacing, fontSize, fontWeight } from '../../../src/constants/theme'
import type { Order } from '../../../src/api/types'

const ACTIVE_STATUSES = ['AWAITING_PAYMENT', 'IN_PROGRESS', 'AWAITING_RELEASE', 'COMPLETED_BY_PROVIDER', 'DISPUTED']

export default function ProviderMessagesScreen() {
  const router = useRouter()
  const { data } = useQuery({
    queryKey: ['provider-orders-chat'],
    queryFn: () => ordersApi.list({ limit: 50 }).then((r) => r.data),
  })

  const activeOrders = ((data as unknown as { orders?: Order[] })?.orders ?? []).filter((o) => ACTIVE_STATUSES.includes(o.status))

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Nachrichten</Text>
      </View>
      <FlatList
        data={activeOrders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={styles.emptyTitle}>Keine Chats</Text>
            <Text style={styles.emptyText}>Hier erscheinen Chats zu deinen aktiven Aufträgen.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => router.push(`/chat/${item.id}`)} activeOpacity={0.85}>
            <Card style={styles.card}>
              <Text style={styles.orderTitle} numberOfLines={1}>
                {item.request?.title ?? `Auftrag #${item.id.slice(-6)}`}
              </Text>
              <Text style={styles.tapHint}>Tippe zum Öffnen des Chats →</Text>
            </Card>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  card: { marginBottom: spacing.md },
  orderTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  tapHint: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center' },
})
