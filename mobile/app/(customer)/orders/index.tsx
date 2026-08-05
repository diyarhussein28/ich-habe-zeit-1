import React, { useState, useMemo } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ScrollView,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ordersApi } from '../../../src/api/orders.api'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { colors, spacing, fontSize, fontWeight } from '../../../src/constants/theme'
import { formatEur } from '../../../src/utils/currency'
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

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'ALL', label: 'Alle' },
  { key: 'ACTIVE', label: 'Aktiv' },
  { key: 'AWAITING_RELEASE', label: 'Freigabe ausstehend' },
  { key: 'RELEASED', label: 'Abgerechnet' },
  { key: 'DISPUTED', label: 'Streitfall' },
  { key: 'CANCELLED', label: 'Abgebrochen' },
]

const ACTIVE_STATUSES = ['AWAITING_PAYMENT', 'IN_PROGRESS', 'COMPLETED_BY_PROVIDER']

export default function CustomerOrdersScreen() {
  const router = useRouter()
  const [filter, setFilter] = useState('ALL')
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['customer-orders'],
    queryFn: () => ordersApi.list({ limit: 50 }).then((r) => r.data),
  })

  const orders = (data as unknown as { orders?: Order[] })?.orders ?? []

  const filteredOrders = useMemo(() => {
    if (filter === 'ALL') return orders
    if (filter === 'ACTIVE') return orders.filter((o) => ACTIVE_STATUSES.includes(o.status))
    return orders.filter((o) => o.status === filter)
  }, [orders, filter])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Buchungen</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📦</Text>
              <Text style={styles.emptyTitle}>Keine Buchungen</Text>
              <Text style={styles.emptyText}>
                {filter === 'ALL' ? 'Hier siehst du deine aktiven und vergangenen Buchungen.' : 'Keine Buchungen in diesem Filter.'}
              </Text>
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
        <Text style={styles.metaItem}>💶 {formatEur(order.totalAmount ?? order.grossAmount ?? 0)}</Text>
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
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: spacing.lg, gap: spacing.xs, paddingBottom: spacing.sm, alignItems: 'center' },
  filterChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 999, borderWidth: 1, borderColor: colors.border, marginRight: spacing.xs, alignSelf: 'flex-start' },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: fontSize.xs, color: colors.textSecondary },
  filterChipTextActive: { color: colors.textInverse, fontWeight: fontWeight.medium },
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
