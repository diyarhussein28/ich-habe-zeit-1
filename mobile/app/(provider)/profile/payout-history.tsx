import React from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { ordersApi } from '../../../src/api/orders.api'
import { formatEur } from '../../../src/utils/currency'
import { formatDate } from '../../../src/utils/date'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'
import type { Order } from '../../../src/api/types'

const PAYOUT_STATUSES = ['RELEASED', 'PARTIALLY_RELEASED']

export default function PayoutHistoryScreen() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['payout-history'],
    queryFn: () => ordersApi.list({ limit: 100, perspective: 'provider' }).then((r) => r.data.orders),
  })

  const payouts = (data ?? []).filter((o: Order) => PAYOUT_STATUSES.includes(o.status))

  const total = payouts.reduce((sum, o) => sum + (o.netProviderAmount ?? o.providerAmount ?? o.releasedAmount ?? 0), 0)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Auszahlungen</Text>
        <View style={{ width: 60 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <>
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Gesamt ausgezahlt</Text>
            <Text style={styles.summaryValue}>{formatEur(total)}</Text>
          </View>

          <FlatList
            data={payouts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>💸</Text>
                <Text style={styles.emptyTitle}>Noch keine Auszahlungen</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.card} onPress={() => router.push(`/(provider)/orders/${item.id}`)} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderTitle} numberOfLines={1}>
                    {(item as unknown as { request?: { title?: string } }).request?.title ?? `Auftrag #${item.id.slice(-6)}`}
                  </Text>
                  <Text style={styles.orderDate}>{formatDate(item.createdAt)}</Text>
                </View>
                <Text style={styles.amount}>+{formatEur(item.netProviderAmount ?? item.providerAmount ?? item.releasedAmount ?? 0)}</Text>
              </TouchableOpacity>
            )}
          />
        </>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { fontSize: fontSize.sm, color: colors.primary },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  summary: { alignItems: 'center', paddingVertical: spacing.lg, backgroundColor: colors.surface, marginHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  summaryLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  summaryValue: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text, marginTop: spacing.xs },
  list: { padding: spacing.lg, gap: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  orderTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text },
  orderDate: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  amount: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.secondary },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
})
