import React, { useState, useMemo } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Image,
} from 'react-native'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { listingsApi, type ServiceListing, type ListingSort } from '../../../src/api/listings.api'
import { providersApi, type ProviderSearchResult, type ProviderSort } from '../../../src/api/providers.api'
import { categoriesApi } from '../../../src/api/categories.api'
import { Card } from '../../../src/components/ui/Card'
import { StarRating } from '../../../src/components/ui/StarRating'
import {
  FilterSheet,
  countActiveFilters,
  type SearchFilters,
} from '../../../src/components/search/FilterSheet'
import { AnimatedEntrance, AnimatedFade } from '../../../src/components/ui/motion'
import { useDebouncedValue } from '../../../src/hooks/useDebouncedValue'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'
import { formatEur } from '../../../src/utils/currency'
import type { ServiceCategory } from '../../../src/api/types'

type Tab = 'listings' | 'providers'

const LISTING_SORTS = [
  { value: 'newest', label: 'Neueste' },
  { value: 'rating', label: 'Beste Bewertung' },
  { value: 'price_asc', label: 'Preis aufsteigend' },
  { value: 'price_desc', label: 'Preis absteigend' },
]

const PROVIDER_SORTS = [
  { value: 'rating', label: 'Beste Bewertung' },
  { value: 'reviews', label: 'Meiste Bewertungen' },
  { value: 'newest', label: 'Neueste' },
]

export default function BrowseScreen() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('listings')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<SearchFilters>({})

  // Debounced so typing doesn't fire a request per keystroke — the search is
  // server-side now, not a filter over an already-loaded page.
  const debouncedSearch = useDebouncedValue(search, 350)

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data.categories),
  })

  const defaultSort = tab === 'listings' ? 'newest' : 'rating'
  const activeFilterCount = countActiveFilters(filters, defaultSort)

  const listingsQuery = useQuery({
    queryKey: ['listings-browse', debouncedSearch, selectedCategory, filters],
    queryFn: () =>
      listingsApi
        .browse({
          q: debouncedSearch.trim() || undefined,
          categoryId: selectedCategory ?? undefined,
          plz: filters.plz,
          priceMin: filters.priceMin,
          priceMax: filters.priceMax,
          pricingModel: filters.pricingModel,
          minRating: filters.minRating,
          verifiedOnly: filters.verifiedOnly,
          availableOnly: filters.availableOnly,
          sort: (filters.sort as ListingSort) ?? 'newest',
          limit: 30,
        })
        .then((r) => r.data),
    enabled: tab === 'listings',
    placeholderData: keepPreviousData,
  })

  const providersQuery = useQuery({
    queryKey: ['providers-search', debouncedSearch, selectedCategory, filters],
    queryFn: () =>
      providersApi
        .search({
          q: debouncedSearch.trim() || undefined,
          categoryId: selectedCategory ?? undefined,
          plz: filters.plz,
          minRating: filters.minRating,
          verifiedOnly: filters.verifiedOnly,
          availableOnly: filters.availableOnly,
          sort: (filters.sort as ProviderSort) ?? 'rating',
          limit: 30,
        })
        .then((r) => r.data),
    enabled: tab === 'providers',
    placeholderData: keepPreviousData,
  })

  const active = tab === 'listings' ? listingsQuery : providersQuery
  const total = active.data?.total ?? 0

  const resultLabel = useMemo(() => {
    if (active.isLoading) return 'Suche läuft…'
    if (total === 0) return 'Keine Treffer'
    return `${total} ${tab === 'listings' ? (total === 1 ? 'Inserat' : 'Inserate') : total === 1 ? 'Dienstleister' : 'Dienstleister'}`
  }, [active.isLoading, total, tab])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Entdecken</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['listings', 'providers'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => { setTab(t); setFilters((f) => ({ ...f, sort: undefined })) }}
            style={[styles.tab, tab === t && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'listings' ? 'Inserate' : 'Dienstleister'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search + filter */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={tab === 'listings' ? 'Leistung suchen…' : 'Name oder Fähigkeit…'}
          placeholderTextColor={colors.textDisabled}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        <TouchableOpacity onPress={() => setFiltersOpen(true)} style={styles.filterBtn}>
          <Text style={styles.filterBtnText}>Filter</Text>
          {activeFilterCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* Category chips */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <TouchableOpacity
            style={[styles.chip, !selectedCategory && styles.chipActive]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text style={[styles.chipText, !selectedCategory && styles.chipTextActive]}>Alle</Text>
          </TouchableOpacity>
          {(categories ?? []).map((cat: ServiceCategory) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.chip, selectedCategory === cat.id && styles.chipActive]}
              onPress={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
            >
              <Text style={[styles.chipText, selectedCategory === cat.id && styles.chipTextActive]}>
                {cat.icon ? `${cat.icon} ` : ''}{cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <Text style={styles.resultCount}>{resultLabel}</Text>

      {tab === 'listings' ? (
        <FlatList
          data={listingsQuery.data?.items ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={listingsQuery.isFetching} onRefresh={listingsQuery.refetch} />
          }
          ListEmptyComponent={<EmptyState loading={listingsQuery.isLoading} kind="listings" />}
          renderItem={({ item, index }) => (
            <AnimatedEntrance index={index}>
              <ListingCard listing={item} onPress={() => router.push(`/(customer)/listings/${item.id}`)} />
            </AnimatedEntrance>
          )}
        />
      ) : (
        <FlatList
          data={providersQuery.data?.items ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={providersQuery.isFetching} onRefresh={providersQuery.refetch} />
          }
          ListEmptyComponent={<EmptyState loading={providersQuery.isLoading} kind="providers" />}
          renderItem={({ item, index }) => (
            <AnimatedEntrance index={index}>
              <ProviderCard provider={item} onPress={() => router.push(`/providers/${item.id}`)} />
            </AnimatedEntrance>
          )}
        />
      )}

      <FilterSheet
        visible={filtersOpen}
        filters={filters}
        sortOptions={tab === 'listings' ? LISTING_SORTS : PROVIDER_SORTS}
        showPriceFilters={tab === 'listings'}
        onApply={(f) => { setFilters(f); setFiltersOpen(false) }}
        onClose={() => setFiltersOpen(false)}
      />
    </SafeAreaView>
  )
}

function EmptyState({ loading, kind }: { loading: boolean; kind: Tab }) {
  if (loading) return <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} />
  return (
    <AnimatedFade style={styles.empty}>
      <Text style={styles.emptyEmoji}>{kind === 'listings' ? '🔍' : '🧑‍🔧'}</Text>
      <Text style={styles.emptyTitle}>Nichts gefunden</Text>
      <Text style={styles.emptyText}>
        Versuche es mit anderen Suchbegriffen oder setze die Filter zurück.
      </Text>
    </AnimatedFade>
  )
}

function ListingCard({ listing, onPress }: { listing: ServiceListing; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Card style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={2}>{listing.title}</Text>
          <Text style={styles.cardPrice}>
            {formatEur(listing.price)}{listing.pricingModel === 'PER_HOUR' ? '/Std.' : ''}
          </Text>
        </View>
        <Text style={styles.cardDesc} numberOfLines={2}>{listing.description}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {listing.provider?.user.displayName ?? 'Dienstleister'}
          </Text>
          {listing.provider ? (
            <View style={styles.ratingRow}>
              <StarRating value={listing.provider.averageRating} size={12} />
              <Text style={styles.cardMeta}>({listing.provider.totalReviews})</Text>
            </View>
          ) : null}
          <Text style={styles.cardMeta}>📍 {listing.city}</Text>
        </View>
      </Card>
    </TouchableOpacity>
  )
}

function ProviderCard({ provider, onPress }: { provider: ProviderSearchResult; onPress: () => void }) {
  const initials = provider.displayName
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Card style={styles.card}>
        <View style={styles.providerTop}>
          {provider.profilePhotoUrl ? (
            <Image source={{ uri: provider.profilePhotoUrl }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials || '?'}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.providerName} numberOfLines={1}>{provider.displayName}</Text>
              {provider.isVerified ? <Text style={styles.verifiedBadge}>✓ Verifiziert</Text> : null}
            </View>
            <View style={styles.ratingRow}>
              <StarRating value={provider.averageRating} size={13} />
              <Text style={styles.cardMeta}>
                {provider.averageRating.toFixed(1)} ({provider.totalReviews})
              </Text>
            </View>
          </View>
          {provider.isAvailable ? (
            <View style={styles.availableDot}>
              <Text style={styles.availableText}>Verfügbar</Text>
            </View>
          ) : null}
        </View>

        {provider.bio ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{provider.bio}</Text>
        ) : null}

        {provider.categories.length > 0 ? (
          <View style={styles.tagRow}>
            {provider.categories.slice(0, 3).map((c) => (
              <View key={c.id} style={styles.tag}>
                <Text style={styles.tagText}>{c.icon ? `${c.icon} ` : ''}{c.name}</Text>
              </View>
            ))}
            {provider.categories.length > 3 ? (
              <Text style={styles.cardMeta}>+{provider.categories.length - 3}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.cardFooter}>
          {provider.listingCount > 0 ? (
            <Text style={styles.cardMeta}>
              {provider.listingCount} Inserat{provider.listingCount !== 1 ? 'e' : ''}
            </Text>
          ) : null}
          {provider.languages.length > 0 ? (
            <Text style={styles.cardMeta}>🗣 {provider.languages.slice(0, 3).join(', ')}</Text>
          ) : null}
        </View>
      </Card>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  backBtn: { padding: spacing.xs },
  backText: { fontSize: fontSize.xl, color: colors.primary },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  tabs: {
    flexDirection: 'row', marginHorizontal: spacing.lg, backgroundColor: colors.border,
    borderRadius: radius.full, padding: 3,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.full },
  tabActive: { backgroundColor: colors.surface },
  tabText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium },
  tabTextActive: { color: colors.text, fontWeight: fontWeight.semibold },
  searchRow: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
  },
  searchInput: {
    flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 10,
    fontSize: fontSize.md, color: colors.text,
  },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryLight,
  },
  filterBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary },
  filterBadge: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  filterBadgeText: { fontSize: 11, fontWeight: fontWeight.bold, color: colors.textInverse },
  chips: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, color: colors.text },
  chipTextActive: { color: colors.textInverse, fontWeight: fontWeight.semibold },
  resultCount: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
    fontSize: fontSize.xs, color: colors.textSecondary,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  card: { marginBottom: spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  cardPrice: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.secondary },
  cardDesc: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 19, marginTop: spacing.xs },
  cardFooter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  cardMeta: { fontSize: fontSize.xs, color: colors.textSecondary },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  providerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.border },
  avatarText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primary },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  providerName: { flexShrink: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  verifiedBadge: { fontSize: 10, color: colors.secondary, fontWeight: fontWeight.bold },
  availableDot: {
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: radius.full, backgroundColor: colors.secondaryLight,
  },
  availableText: { fontSize: 10, fontWeight: fontWeight.semibold, color: colors.secondary },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  tag: {
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
  },
  tagText: { fontSize: 11, color: colors.textSecondary },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs, textAlign: 'center' },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
})
