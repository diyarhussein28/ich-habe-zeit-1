import React from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ordersApi } from '../../../src/api/orders.api'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { colors, spacing, fontSize, fontWeight } from '../../../src/constants/theme'
import type { Order } from '../../../src/api/types'
import { formatDate } from '../../../src/utils/date'

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Zahlung ausstehend',
  IN_PROGRESS: 'In Bearbeitung',
  COMPLETED_BY_PROVIDER: 'Abgeschlossen',
  AWAITING_RELEASE: 'Freigabe ausstehend',
  RELEASED: 'Abgerechnet',
  DISPUTED: 'Streitfall',
  REFUNDED: 'Erstattet',
  CANCELLED: 'Abgebrochen',
}

const STATUS_COLOR: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  AWAITING_PAYMENT: 'warning',
  IN_PROGRESS: 'primary',
  COMPLETED_BY_PROVIDER: 'success',
  AWAITING_RELEASE: 'warning',
  RELEASED: 'success',
  DISPUTED: 'error',
  REFUNDED: 'neutral',
  CANCELLED: 'neutral',
}

export default function CustomerOrdersScreen() {
  const router = useRouter()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['customer-orders'],
    queryFn: () => ordersApi.list({ limit: 50 }).then((r) => r.data),
  })

  const orders = (data as unknown as { orders?: Order[] })?.orders ?? []

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Buchungen</Text>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📦</Text>
              <Text style={styles.emptyTitle}>Keine Buchungen</Text>
              <Text style={styles.emptyText}>Hier siehst du deine aktiven und vergangenen Buchungen.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => router.push(`/orders/${item.id}`)} activeOpacity={0.85}>
            <OrderCard order={item} />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  )
}

function OrderCard({ order }: { order: Order }) {
  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {order.request?.title ?? `Buchung #${order.id.slice(-6)}`}
        </Text>
        <Badge
          label={STATUS_LABEL[order.status] ?? order.status}
          color={STATUS_COLOR[order.status] ?? 'neutral'}
        />
      </View>
      <View style={styles.cardMeta}>
        <Text style={styles.metaItem}>💶 {(order.totalAmount ?? order.grossAmount ?? 0).toFixed(2)} €</Text>
        <Text style={styles.metaItem}>
          📅 {formatDate(order.createdAt)}
        </Text>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  card: { marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  cardTitle: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginRight: spacing.sm },
  cardMeta: { flexDirection: 'row', gap: spacing.md },
  metaItem: { fontSize: fontSize.xs, color: colors.textSecondary },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
})
