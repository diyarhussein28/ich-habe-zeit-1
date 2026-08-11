import React, { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { categoriesApi } from '../../src/api/categories.api'
import { requestsApi } from '../../src/api/requests.api'
import { Card } from '../../src/components/ui/Card'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { useAuthStore } from '../../src/store/auth.store'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'
import type { ServiceCategory, ServiceRequest } from '../../src/api/types'
import { formatDate } from '../../src/utils/date'
import { formatEur } from '../../src/utils/currency'
import { isActiveOrderStatus } from '../../src/constants/orderStatus'

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Offen',
  OFFER_RECEIVED: 'Angebote erhalten',
  AWAITING_PAYMENT: 'Zahlung ausstehend',
  IN_PROGRESS: 'In Bearbeitung',
  COMPLETED_BY_PROVIDER: 'Abgeschlossen',
  AWAITING_RELEASE: 'Freigabe ausstehend',
  DISPUTED: 'Streitfall',
}

const STATUS_COLOR: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  OPEN: 'primary',
  OFFER_RECEIVED: 'warning',
  AWAITING_PAYMENT: 'warning',
  IN_PROGRESS: 'primary',
  COMPLETED_BY_PROVIDER: 'success',
  AWAITING_RELEASE: 'warning',
  DISPUTED: 'error',
}

export default function CustomerHomeScreen() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const { data: categories, isLoading: catsLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data.categories),
  })

  const { data: myRequests, isLoading: activeOrdersLoading } = useQuery({
    queryKey: ['my-requests'],
    queryFn: () => requestsApi.list({ limit: 20 }).then((r) => r.data.items),
    enabled: !!user,
  })

  const filtered = categories?.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  )

  // Active = still waiting for/reviewing offers, or an accepted offer that's
  // now an order in progress — everything except drafts, history, and
  // cancelled/expired requests.
  const activeOrders = (myRequests ?? []).filter((r) => isActiveOrderStatus(r.status)).slice(0, 3)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hallo, {user?.displayName} 👋</Text>
          <Text style={styles.subgreeting}>Was suchst du heute?</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/requests/create')} style={styles.postBtn}>
          <Text style={styles.postBtnText}>+ Auftrag</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrapper}>
        <TextInput
          style={styles.searchInput}
          placeholder="Dienstleistung suchen..."
          placeholderTextColor={colors.textDisabled}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {/* Active jobs */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Aktive Aufträge</Text>
            <TouchableOpacity onPress={() => router.push('/(customer)/requests')}>
              <Text style={styles.seeAll}>Alle anzeigen →</Text>
            </TouchableOpacity>
          </View>
          {activeOrdersLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
          ) : activeOrders.length === 0 ? (
            <View style={styles.activeEmpty}>
              <Text style={styles.activeEmptyEmoji}>✅</Text>
              <Text style={styles.activeEmptyTitle}>Keine aktiven Aufträge</Text>
              <Text style={styles.activeEmptyText}>
                Du hast gerade nichts Laufendes. Durchsuche Inserate oder erstelle einen neuen Auftrag.
              </Text>
            </View>
          ) : (
            activeOrders.map((request) => (
              <ActiveRequestCard
                key={request.id}
                request={request}
                onView={() => router.push(`/(customer)/requests/${request.id}`)}
              />
            ))
          )}
        </View>

        {/* Inserate banner */}
        <TouchableOpacity
          style={styles.inserteBanner}
          activeOpacity={0.85}
          onPress={() => router.push('/(customer)/listings')}
        >
          <View>
            <Text style={styles.inserteBannerTitle}>Inserate durchsuchen</Text>
            <Text style={styles.inserteBannerSub}>Dienstleister mit Festpreisen in deiner Nähe</Text>
          </View>
          <Text style={styles.inserteBannerArrow}>→</Text>
        </TouchableOpacity>

        {/* Categories */}
        <Text style={styles.sectionTitle}>Kategorien</Text>
        {catsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (filtered?.length === 0) ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Keine Kategorien gefunden</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {(filtered ?? []).map((item) => (
              <CategoryCard
                key={item.id}
                category={item}
                selected={selectedCategory === item.id}
                onPress={() => {
                  setSelectedCategory(item.id === selectedCategory ? null : item.id)
                  router.push({
                    pathname: '/(customer)/browse/[categoryId]',
                    params: { categoryId: item.id, categoryName: item.name },
                  })
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function ActiveRequestCard({
  request,
  onView,
}: {
  request: ServiceRequest
  onView: () => void
}) {
  const budget = request.budgetMax ?? request.budget
  const offerCount = request._count?.offers ?? 0
  return (
    <TouchableOpacity onPress={onView} activeOpacity={0.85}>
      <Card style={styles.recentCard}>
        <Text style={styles.recentTitle} numberOfLines={1}>{request.title}</Text>
        <View style={styles.recentRow}>
          {budget ? <Text style={styles.recentAmount}>{formatEur(budget)}</Text> : <View />}
          <Badge label={STATUS_LABEL[request.status] ?? request.status} color={STATUS_COLOR[request.status] ?? 'neutral'} />
        </View>
        <Text style={styles.recentDate}>
          {formatDate(request.createdAt)}
          {offerCount > 0 ? ` · ${offerCount} Angebot${offerCount !== 1 ? 'e' : ''}` : ''}
        </Text>
      </Card>
    </TouchableOpacity>
  )
}

function CategoryCard({
  category,
  selected,
  onPress,
}: {
  category: ServiceCategory
  selected: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.catCard, selected ? styles.catCardSelected : null]}
    >
      <Text style={styles.catIcon}>{category.icon ?? '🔧'}</Text>
      <Text style={styles.catName} numberOfLines={2}>
        {category.name}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  greeting: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  subgreeting: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  postBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  postBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textInverse },
  searchWrapper: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: fontSize.md,
    color: colors.text,
  },
  section: { marginBottom: spacing.lg },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  seeAll: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  row: { gap: spacing.md, marginBottom: spacing.md },
  recentCard: { marginBottom: spacing.sm },
  recentTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.xs },
  recentRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  recentAmount: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text },
  recentStatus: { fontSize: fontSize.xs, color: colors.textSecondary },
  recentDate: { fontSize: fontSize.xs, color: colors.textDisabled },
  catCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    minHeight: 100,
    justifyContent: 'center',
  },
  catCardSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  catIcon: { fontSize: 36, marginBottom: spacing.sm },
  inserteBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.primary, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.lg,
  },
  inserteBannerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textInverse },
  inserteBannerSub: { fontSize: fontSize.xs, color: colors.textInverse, opacity: 0.85, marginTop: 2 },
  inserteBannerArrow: { fontSize: 22, color: colors.textInverse },
  catName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.text,
    textAlign: 'center',
  },
  empty: { alignItems: 'center', paddingTop: spacing.xl },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary },
  activeEmpty: {
    alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  activeEmptyEmoji: { fontSize: 36, marginBottom: spacing.sm },
  activeEmptyTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs, textAlign: 'center' },
  activeEmptyText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
})
