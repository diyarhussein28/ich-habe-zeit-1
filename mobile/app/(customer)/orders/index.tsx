import React, { useState, useMemo } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ordersApi } from '../../../src/api/orders.api'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { ErrorState } from '../../../src/components/ui/ErrorState'
import { colors, spacing, fontSize, fontWeight } from '../../../src/constants/theme'
import { formatEur } from '../../../src/utils/currency'
import type { Order } from '../../../src/api/types'
import { formatDate } from '../../../src/utils/date'
import { isActiveOrderStatus } from '../../../src/constants/orderStatus'

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Zahlung ausstehend',
  IN_PROGRESS: 'In Bearbeitung',
  COMPLETED_BY_PROVIDER: 'Abgeschlossen',
  AWAITING_RELEASE: 'Freigabe ausstehend',
  RELEASED: 'Abgerechnet',
  DISPUTED: 'Streitfall',
  REFUNDED: 'Erstattet',
  PARTIALLY_RELEASED: 'Teilweise ausgezahlt',
  CANCELLED: 'Abgebrochen',
  EXPIRED: 'Abgelaufen',
}

const STATUS_COLOR: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  AWAITING_PAYMENT: 'warning',
  IN_PROGRESS: 'primary',
  COMPLETED_BY_PROVIDER: 'success',
  AWAITING_RELEASE: 'warning',
  RELEASED: 'success',
  DISPUTED: 'error',
  REFUNDED: 'neutral',
  PARTIALLY_RELEASED: 'success',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
}

type Tab = 'ACTIVE' | 'HISTORY'

export default function CustomerOrdersScreen() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('ACTIVE')
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['customer-orders'],
    queryFn: () => ordersApi.list({ limit: 50, perspective: 'customer' }).then((r) => r.data),
  })

  const orders = (data as unknown as { orders?: Order[] })?.orders ?? []

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => (tab === 'ACTIVE' ? isActiveOrderStatus(o.status) : !isActiveOrderStatus(o.status)))
  }, [orders, tab])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Buchungen</Text>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'ACTIVE' && styles.tabActive]}
          onPress={() => setTab('ACTIVE')}
        >
          <Text style={[styles.tabText, tab === 'ACTIVE' && styles.tabTextActive]}>Aktiv</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'HISTORY' && styles.tabActive]}
          onPress={() => setTab('HISTORY')}
        >
          <Text style={[styles.tabText, tab === 'HISTORY' && styles.tabTextActive]}>Verlauf</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
          ) : isError ? (
            <ErrorState error={error} onRetry={() => refetch()} retrying={isRefetching} style={{ marginTop: spacing.xxl }} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>{tab === 'ACTIVE' ? '✅' : '📦'}</Text>
              <Text style={styles.emptyTitle}>
                {tab === 'ACTIVE' ? 'Keine aktiven Buchungen' : 'Noch keine vergangenen Buchungen'}
              </Text>
              <Text style={styles.emptyText}>
                {tab === 'ACTIVE'
                  ? 'Sobald du einen Auftrag buchst, erscheint er hier.'
                  : 'Abgeschlossene und stornierte Buchungen landen hier.'}
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
  tabRow: {
    flexDirection: 'row', marginHorizontal: spacing.lg, marginBottom: spacing.md,
    backgroundColor: colors.surface, borderRadius: 999, borderWidth: 1, borderColor: colors.border, padding: 3,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: 999 },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  tabTextActive: { color: colors.textInverse },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  card: { marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  cardTitle: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginRight: spacing.sm },
  cardMeta: { flexDirection: 'row', gap: spacing.md },
  metaItem: { fontSize: fontSize.xs, color: colors.textSecondary },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
})
