import React, { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ordersApi } from '../../../src/api/orders.api'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { Button } from '../../../src/components/ui/Button'
import { getApiErrorMessage } from '../../../src/api/client'
import { colors, spacing, fontSize, fontWeight } from '../../../src/constants/theme'
import { formatEur } from '../../../src/utils/currency'
import type { Order } from '../../../src/api/types'

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Zahlung ausstehend',
  IN_PROGRESS: 'In Bearbeitung',
  COMPLETED_BY_PROVIDER: 'Abgeschlossen (warte Freigabe)',
  AWAITING_RELEASE: 'Freigabe ausstehend',
  RELEASED: 'Abgerechnet',
  DISPUTED: 'Streitfall',
  CANCELLED: 'Abgebrochen',
}

const STATUS_COLOR: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  AWAITING_PAYMENT: 'warning',
  IN_PROGRESS: 'primary',
  COMPLETED_BY_PROVIDER: 'success',
  AWAITING_RELEASE: 'warning',
  RELEASED: 'success',
  DISPUTED: 'error',
  CANCELLED: 'neutral',
}

export default function ProviderOrdersScreen() {
  const router = useRouter()
  const qc = useQueryClient()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [completeError, setCompleteError] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['provider-orders'],
    queryFn: () => ordersApi.list({ limit: 50 }).then((r) => r.data),
  })

  const completeMutation = useMutation({
    mutationFn: (orderId: string) => ordersApi.markComplete(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-orders'] })
      setConfirmId(null)
      setCompleteError(null)
    },
    onError: (err) => setCompleteError(getApiErrorMessage(err)),
  })

  const orders = (data as unknown as { orders?: Order[] })?.orders ?? []

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Meine Aufträge</Text>
      </View>

      {confirmId ? (
        <View style={styles.confirmBanner}>
          <Text style={styles.confirmText}>Arbeit wirklich als abgeschlossen markieren?</Text>
          {completeError ? <Text style={styles.errorText}>{completeError}</Text> : null}
          <View style={styles.confirmActions}>
            <TouchableOpacity onPress={() => { setConfirmId(null); setCompleteError(null) }} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Abbrechen</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => completeMutation.mutate(confirmId)}
              style={styles.confirmBtn}
              disabled={completeMutation.isPending}
            >
              <Text style={styles.confirmBtnText}>
                {completeMutation.isPending ? 'Wird gesendet...' : 'Bestätigen'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔧</Text>
              <Text style={styles.emptyTitle}>Keine Aufträge</Text>
              <Text style={styles.emptyText}>Du hast aktuell keine aktiven Aufträge.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onDetail={() => router.push(`/orders/${item.id}`)}
            onChat={() => router.push(`/chat/${item.id}`)}
            onComplete={item.status === 'IN_PROGRESS' ? () => setConfirmId(item.id) : undefined}
          />
        )}
      />
    </SafeAreaView>
  )
}

function OrderCard({
  order,
  onDetail,
  onChat,
  onComplete,
}: {
  order: Order
  onDetail: () => void
  onChat: () => void
  onComplete?: () => void
}) {
  return (
    <TouchableOpacity onPress={onDetail} activeOpacity={0.85}>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {order.request?.title ?? `Auftrag #${order.id.slice(-6)}`}
          </Text>
          <Badge label={STATUS_LABEL[order.status] ?? order.status} color={STATUS_COLOR[order.status] ?? 'neutral'} />
        </View>
        <View style={styles.amounts}>
          <Text style={styles.amountLabel}>Auszahlung</Text>
          <Text style={styles.amountValue}>
            {formatEur(order.netProviderAmount ?? order.providerAmount ?? 0)}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); onChat() }} style={styles.chatBtn}>
            <Text style={styles.chatBtnText}>💬 Chat</Text>
          </TouchableOpacity>
          {onComplete ? (
            <Button label="Abschließen" onPress={onComplete} size="sm" fullWidth={false} style={styles.completeBtn} />
          ) : null}
        </View>
      </Card>
    </TouchableOpacity>
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
  amounts: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  amountLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  amountValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.secondary },
  cardActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  chatBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: 8, paddingVertical: spacing.sm, alignItems: 'center' },
  chatBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text },
  completeBtn: { flex: 1 },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center' },
  confirmBanner: {
    margin: spacing.lg, padding: spacing.md, borderRadius: 10,
    backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#f59e0b',
  },
  confirmText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm },
  errorText: { fontSize: fontSize.sm, color: colors.error, marginBottom: spacing.sm },
  confirmActions: { flexDirection: 'row', gap: spacing.sm },
  cancelBtn: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  cancelBtnText: { fontSize: fontSize.sm, color: colors.textSecondary },
  confirmBtn: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: 8,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  confirmBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textInverse },
})
