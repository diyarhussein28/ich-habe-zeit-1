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
import { ordersApi } from '../../src/api/orders.api'
import { Card } from '../../src/components/ui/Card'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { useAuthStore } from '../../src/store/auth.store'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'
import type { ServiceCategory, Order } from '../../src/api/types'

export default function CustomerHomeScreen() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const { data: categories, isLoading: catsLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data.categories),
  })

  const { data: recentOrdersData } = useQuery({
    queryKey: ['customer-orders-recent'],
    queryFn: () => ordersApi.list({ limit: 3 }).then((r) => {
      const raw = r.data as unknown as { orders?: Order[] }
      return raw.orders ?? []
    }),
    enabled: !!user,
  })

  const filtered = categories?.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  )

  const recentOrders = recentOrdersData ?? []

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hallo, {user?.displayName} 👋</Text>
          <Text style={styles.subgreeting}>Was suchst du heute?</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(customer)/requests/create')} style={styles.postBtn}>
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
        {/* Recent orders */}
        {recentOrders.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Zuletzt gebucht</Text>
              <TouchableOpacity onPress={() => router.push('/(customer)/orders')}>
                <Text style={styles.seeAll}>Alle anzeigen →</Text>
              </TouchableOpacity>
            </View>
            {recentOrders.map((order) => (
              <RecentOrderCard
                key={order.id}
                order={order}
                onRepeat={() =>
                  router.push({
                    pathname: '/(customer)/requests/create',
                    params: order.request?.categoryId
                      ? { categoryId: order.request.categoryId }
                      : {},
                  })
                }
                onView={() => router.push(`/(customer)/orders/${order.id}`)}
              />
            ))}
          </View>
        )}

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

function RecentOrderCard({
  order,
  onRepeat,
  onView,
}: {
  order: Order
  onRepeat: () => void
  onView: () => void
}) {
  const title = (order as unknown as { request?: { title?: string } }).request?.title ?? 'Buchung'
  const amount = (order.grossAmount ?? order.totalAmount ?? 0).toFixed(2)
  const STATUS_LABEL: Record<string, string> = {
    AWAITING_PAYMENT: 'Zahlung ausstehend',
    IN_PROGRESS: 'In Bearbeitung',
    AWAITING_RELEASE: 'Freigabe ausstehend',
    COMPLETED_BY_PROVIDER: 'Abgeschlossen',
    RELEASED: 'Abgerechnet',
    CANCELLED: 'Abgebrochen',
  }
  return (
    <Card style={styles.recentCard}>
      <TouchableOpacity onPress={onView} activeOpacity={0.8}>
        <Text style={styles.recentTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.recentRow}>
          <Text style={styles.recentAmount}>{amount} €</Text>
          <Text style={styles.recentStatus}>{STATUS_LABEL[order.status] ?? order.status}</Text>
        </View>
        <Text style={styles.recentDate}>{new Date(order.createdAt).toLocaleDateString('de-DE')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onRepeat} style={styles.repeatBtn}>
        <Text style={styles.repeatBtnText}>↩ Wiederholen</Text>
      </TouchableOpacity>
    </Card>
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
  recentDate: { fontSize: fontSize.xs, color: colors.textDisabled, marginBottom: spacing.sm },
  repeatBtn: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, alignItems: 'center' },
  repeatBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },
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
  catName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.text,
    textAlign: 'center',
  },
  empty: { alignItems: 'center', paddingTop: spacing.xl },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary },
})
