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
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { requestsApi } from '../../../src/api/requests.api'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { Button } from '../../../src/components/ui/Button'
import { colors, spacing, fontSize, fontWeight } from '../../../src/constants/theme'
import type { ServiceRequest } from '../../../src/api/types'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Entwurf',
  OPEN: 'Offen',
  OFFER_RECEIVED: 'Angebote erhalten',
  AWAITING_PAYMENT: 'Zahlung ausstehend',
  IN_PROGRESS: 'In Bearbeitung',
  COMPLETED_BY_PROVIDER: 'Abgeschlossen',
  AWAITING_RELEASE: 'Freigabe ausstehend',
  RELEASED: 'Bezahlt',
  DISPUTED: 'Streitfall',
  CANCELLED: 'Abgebrochen',
  EXPIRED: 'Abgelaufen',
}

const STATUS_COLOR: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  DRAFT: 'neutral',
  OPEN: 'primary',
  OFFER_RECEIVED: 'warning',
  AWAITING_PAYMENT: 'warning',
  IN_PROGRESS: 'primary',
  COMPLETED_BY_PROVIDER: 'success',
  AWAITING_RELEASE: 'warning',
  RELEASED: 'success',
  DISPUTED: 'error',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
}

export default function MyRequestsScreen() {
  const router = useRouter()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-requests'],
    queryFn: () => requestsApi.list({ limit: 50 }).then((r) => r.data),
  })

  const requests = (data as unknown as { items?: ServiceRequest[] })?.items ?? []

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Meine Aufträge</Text>
        <TouchableOpacity
          onPress={() => router.push('/(customer)/requests/create')}
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
              <Text style={styles.emptyTitle}>Noch keine Aufträge</Text>
              <Text style={styles.emptyText}>Erstelle deinen ersten Auftrag und finde den passenden Dienstleister.</Text>
              <Button
                label="Auftrag erstellen"
                onPress={() => router.push('/(customer)/requests/create')}
                style={styles.emptyBtn}
              />
            </View>
          )
        }
        renderItem={({ item }) => <RequestCard request={item} onPress={() => router.push(`/(customer)/requests/${item.id}`)} />}
      />
    </SafeAreaView>
  )
}

function RequestCard({ request, onPress }: { request: ServiceRequest; onPress: () => void }) {
  const offerCount = request._count?.offers ?? 0
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>{request.title}</Text>
          <Badge label={STATUS_LABEL[request.status] ?? request.status} color={STATUS_COLOR[request.status] ?? 'neutral'} />
        </View>
        <Text style={styles.cardDesc} numberOfLines={2}>{request.description}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.metaItem}>📍 {request.addressCity ?? request.city ?? ''} {request.plz}</Text>
          {(request.budgetMin ?? request.budget) ? <Text style={styles.metaItem}>💶 {(request.budgetMin ?? request.budget)!.toFixed(2)} €</Text> : null}
          {offerCount > 0 ? (
            <Text style={[styles.metaItem, styles.offerBadge]}>
              {offerCount} Angebot{offerCount !== 1 ? 'e' : ''}
            </Text>
          ) : null}
        </View>
      </Card>
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
  },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 20,
  },
  addBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textInverse },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  card: { marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs },
  cardTitle: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginRight: spacing.sm },
  cardDesc: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.sm },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metaItem: { fontSize: fontSize.xs, color: colors.textSecondary },
  offerBadge: { color: colors.primary, fontWeight: fontWeight.semibold },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  emptyBtn: { width: 200 },
})
