import React from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { requestsApi } from '../../../src/api/requests.api'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { colors, spacing, fontSize, fontWeight } from '../../../src/constants/theme'
import type { ServiceRequest } from '../../../src/api/types'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Entwurf',
  OPEN: 'Offen',
  OFFER_RECEIVED: 'Angebote erhalten',
  AWAITING_PAYMENT: 'Zahlung ausstehend',
  IN_PROGRESS: 'In Bearbeitung',
  COMPLETED_BY_PROVIDER: 'Abgeschlossen',
  RELEASED: 'Bezahlt',
  CANCELLED: 'Abgebrochen',
  EXPIRED: 'Abgelaufen',
}

const STATUS_COLOR: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  DRAFT: 'neutral', OPEN: 'primary', OFFER_RECEIVED: 'warning',
  AWAITING_PAYMENT: 'warning', IN_PROGRESS: 'primary',
  COMPLETED_BY_PROVIDER: 'success', RELEASED: 'success',
  CANCELLED: 'neutral', EXPIRED: 'neutral',
}

export default function ProviderRequestsScreen() {
  const router = useRouter()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-requests'],
    queryFn: () => requestsApi.list({ limit: 50 }).then((r) => r.data),
  })

  const requests = (data as unknown as { items?: ServiceRequest[] })?.items ?? []

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Meine Anfragen</Text>
        <TouchableOpacity
          onPress={() => router.push('/requests/create')}
          style={styles.addBtn}
        >
          <Text style={styles.addBtnText}>+ Neu</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyTitle}>Keine Anfragen</Text>
              <Text style={styles.emptyText}>
                Du hast noch keine Aufträge als Auftraggeber erstellt.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push(`/(customer)/requests/${item.id}`)}
          >
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                <Badge label={STATUS_LABEL[item.status] ?? item.status} color={STATUS_COLOR[item.status] ?? 'neutral'} />
              </View>
              <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
              <View style={styles.cardMeta}>
                <Text style={styles.metaItem}>📍 {item.addressCity ?? item.plz}</Text>
                {(item.budgetMin ?? item.budget) ? (
                  <Text style={styles.metaItem}>💶 {(item.budgetMin ?? item.budget)!.toFixed(0)} €</Text>
                ) : null}
                {(item._count?.offers ?? 0) > 0 ? (
                  <Text style={styles.offerBadge}>
                    {item._count!.offers} Angebot{item._count!.offers !== 1 ? 'e' : ''}
                  </Text>
                ) : null}
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm,
  },
  backBtn: { padding: spacing.xs },
  backText: { fontSize: fontSize.xl, color: colors.primary },
  title: { flex: 1, fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: 20,
  },
  addBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textInverse },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  card: { marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs },
  cardTitle: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginRight: spacing.sm },
  cardDesc: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.sm },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metaItem: { fontSize: fontSize.xs, color: colors.textSecondary },
  offerBadge: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
})
