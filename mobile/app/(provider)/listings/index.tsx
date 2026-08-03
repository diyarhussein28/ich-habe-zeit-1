import React from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { listingsApi, ServiceListing } from '../../../src/api/listings.api'
import { useAuthStore } from '../../../src/store/auth.store'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Aktiv',
  PAUSED: 'Pausiert',
  ARCHIVED: 'Archiviert',
}
const STATUS_COLOR: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  ARCHIVED: 'neutral',
}

export default function ProviderListingsScreen() {
  const router = useRouter()
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-listings'],
    queryFn: () => listingsApi.browse({ limit: 50 }).then((r) => r.data),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'PAUSED' }) =>
      listingsApi.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-listings'] }),
  })

  const listings = data?.items ?? []

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Meine Inserate</Text>
        <TouchableOpacity
          onPress={() => router.push('/(provider)/listings/create')}
          style={styles.addBtn}
        >
          <Text style={styles.addBtnText}>+ Neu</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📢</Text>
              <Text style={styles.emptyTitle}>Noch keine Inserate</Text>
              <Text style={styles.emptyText}>
                Erstelle dein erstes Inserat und werde von Kunden gefunden.
              </Text>
              <TouchableOpacity
                style={styles.createBtn}
                onPress={() => router.push('/(provider)/listings/create')}
              >
                <Text style={styles.createBtnText}>Inserat erstellen</Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Badge
                label={STATUS_LABEL[item.status] ?? item.status}
                color={STATUS_COLOR[item.status] ?? 'neutral'}
              />
            </View>
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
            <View style={styles.cardMeta}>
              <Text style={styles.metaItem}>
                💶 {item.price.toFixed(0)} €{item.pricingModel === 'PER_HOUR' ? '/Std.' : ' Festpr.'}
              </Text>
              <Text style={styles.metaItem}>📍 {item.city}</Text>
              <Text style={styles.metaItem}>👁 {item.viewCount} Aufrufe</Text>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnOutline]}
                onPress={() =>
                  toggleMutation.mutate({
                    id: item.id,
                    status: item.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
                  })
                }
                disabled={toggleMutation.isPending}
              >
                <Text style={styles.actionBtnOutlineText}>
                  {item.status === 'ACTIVE' ? '⏸ Pausieren' : '▶ Aktivieren'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDanger]}
                onPress={() => listingsApi.update(item.id, { status: 'ARCHIVED' }).then(() => refetch())}
              >
                <Text style={styles.actionBtnDangerText}>Archivieren</Text>
              </TouchableOpacity>
            </View>
          </Card>
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
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.full,
  },
  addBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textInverse },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  card: { marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs },
  cardTitle: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginRight: spacing.sm },
  cardDesc: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.sm },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  metaItem: { fontSize: fontSize.xs, color: colors.textSecondary },
  cardActions: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { flex: 1, paddingVertical: spacing.xs + 2, borderRadius: radius.md, alignItems: 'center' },
  actionBtnOutline: { borderWidth: 1, borderColor: colors.primary },
  actionBtnOutlineText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold },
  actionBtnDanger: { borderWidth: 1, borderColor: colors.error },
  actionBtnDangerText: { fontSize: fontSize.xs, color: colors.error, fontWeight: fontWeight.semibold },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  createBtn: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md, borderRadius: radius.full,
  },
  createBtnText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textInverse },
})
