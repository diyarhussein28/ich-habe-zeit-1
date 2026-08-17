import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { ordersApi } from '../../../src/api/orders.api'
import { profileApi } from '../../../src/api/profile.api'
import { formatEur } from '../../../src/utils/currency'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'
import type { Order } from '../../../src/api/types'

const ACTIVE_STATUSES = ['IN_PROGRESS', 'AWAITING_RELEASE', 'COMPLETED_BY_PROVIDER']
const PAYOUT_STATUSES = ['RELEASED', 'PARTIALLY_RELEASED']

function startOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export default function ProviderDashboardScreen() {
  const router = useRouter()

  const { data: orders, isLoading } = useQuery({
    queryKey: ['provider-dashboard-orders'],
    queryFn: () => ordersApi.list({ limit: 200, perspective: 'provider' }).then((r) => r.data.orders),
  })

  const { data: profile } = useQuery({
    queryKey: ['provider-profile'],
    queryFn: () => profileApi.getProviderProfile().then((r) => r.data.profile),
  })

  const { data: earnings } = useQuery({
    queryKey: ['provider-earnings'],
    queryFn: () => profileApi.getProviderEarnings().then((r) => r.data.months),
  })

  const list = orders ?? []
  const paidOut = list.filter((o: Order) => PAYOUT_STATUSES.includes(o.status))
  const active = list.filter((o: Order) => ACTIVE_STATUSES.includes(o.status))
  const totalEarnings = paidOut.reduce((sum, o) => sum + (o.netProviderAmount ?? o.providerAmount ?? o.releasedAmount ?? 0), 0)
  const monthEarnings = paidOut
    .filter((o) => new Date(o.createdAt) >= startOfMonth())
    .reduce((sum, o) => sum + (o.netProviderAmount ?? o.providerAmount ?? o.releasedAmount ?? 0), 0)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Übersicht</Text>
        <View style={{ width: 60 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Gesamteinnahmen</Text>
            <Text style={styles.heroValue}>{formatEur(totalEarnings)}</Text>
            <Text style={styles.heroSub}>{formatEur(monthEarnings)} diesen Monat</Text>
          </View>

          <View style={styles.statsRow}>
            <StatTile label="Aktive Aufträge" value={String(active.length)} emoji="📦" />
            <StatTile label="Abgeschlossen" value={String(paidOut.length)} emoji="✅" />
          </View>

          <View style={styles.statsRow}>
            <StatTile label="Bewertung" value={profile ? profile.averageRating.toFixed(1) : '—'} emoji="⭐" />
            <StatTile label="Rezensionen" value={profile ? String(profile.totalReviews) : '—'} emoji="💬" />
          </View>

          {earnings && earnings.some((m) => m.netAmount > 0) ? (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Einnahmen der letzten 6 Monate</Text>
              <EarningsChart months={earnings} />
            </View>
          ) : null}

          <TouchableOpacity style={styles.linkCard} onPress={() => router.push('/(provider)/profile/payout-history')}>
            <Text style={styles.linkCardText}>Alle Auszahlungen ansehen</Text>
            <Text style={styles.linkCardArrow}>›</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function EarningsChart({ months }: { months: { key: string; label: string; netAmount: number; orderCount: number }[] }) {
  const max = Math.max(1, ...months.map((m) => m.netAmount))
  return (
    <View style={styles.chartRow}>
      {months.map((m) => (
        <View key={m.key} style={styles.chartBarWrap}>
          <Text style={styles.chartBarValue}>{m.netAmount > 0 ? formatEur(m.netAmount) : ''}</Text>
          <View style={styles.chartBarTrack}>
            <View style={[styles.chartBar, { height: `${Math.max(4, (m.netAmount / max) * 100)}%` }]} />
          </View>
          <Text style={styles.chartBarLabel}>{m.label}</Text>
        </View>
      ))}
    </View>
  )
}

function StatTile({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { fontSize: fontSize.sm, color: colors.primary },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  content: { padding: spacing.lg },
  heroCard: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.lg, alignItems: 'center', marginBottom: spacing.md },
  heroLabel: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)' },
  heroValue: { fontSize: fontSize.xxxl, fontWeight: fontWeight.bold, color: colors.textInverse, marginTop: spacing.xs },
  heroSub: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.8)', marginTop: spacing.xs },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  statTile: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, alignItems: 'center' },
  statEmoji: { fontSize: 22, marginBottom: spacing.xs },
  statValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  statLabel: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  chartCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  chartTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.md },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 140 },
  chartBarWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  chartBarValue: { fontSize: 9, color: colors.textSecondary, marginBottom: 2 },
  chartBarTrack: { width: 18, flex: 1, justifyContent: 'flex-end' },
  chartBar: { width: '100%', backgroundColor: colors.primary, borderRadius: radius.sm, minHeight: 4 },
  chartBarLabel: { fontSize: 9, color: colors.textDisabled, marginTop: spacing.xs },
  linkCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm },
  linkCardText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text },
  linkCardArrow: { fontSize: fontSize.lg, color: colors.textSecondary },
})
