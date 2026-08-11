import React, { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { listingsApi, ServiceListing } from '../../../src/api/listings.api'
import { categoriesApi } from '../../../src/api/categories.api'
import { Card } from '../../../src/components/ui/Card'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'
import type { ServiceCategory } from '../../../src/api/types'

export default function BrowseListingsScreen() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [pricingModel, setPricingModel] = useState<'FIXED_PRICE' | 'PER_HOUR' | null>(null)

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data.categories),
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['listings-browse', selectedCategory, pricingModel],
    queryFn: () =>
      listingsApi
        .browse({
          categoryId: selectedCategory ?? undefined,
          pricingModel: pricingModel ?? undefined,
          limit: 30,
        })
        .then((r) => r.data),
  })

  const allListings = data?.items ?? []
  const filtered = search.trim()
    ? allListings.filter(
        (l) =>
          l.title.toLowerCase().includes(search.toLowerCase()) ||
          l.city.toLowerCase().includes(search.toLowerCase()),
      )
    : allListings

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Inserate</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Suche nach Titel oder Stadt..."
          placeholderTextColor={colors.textDisabled}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
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
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Pricing model toggle */}
      <View style={styles.toggleRow}>
        {[
          { value: null, label: 'Alle' },
          { value: 'FIXED_PRICE', label: 'Festpreis' },
          { value: 'PER_HOUR', label: 'Stundenlohn' },
        ].map((opt) => (
          <TouchableOpacity
            key={String(opt.value)}
            style={[styles.toggleBtn, pricingModel === opt.value && styles.toggleBtnActive]}
            onPress={() => setPricingModel(opt.value as 'FIXED_PRICE' | 'PER_HOUR' | null)}
          >
            <Text style={[styles.toggleText, pricingModel === opt.value && styles.toggleTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyTitle}>Keine Inserate gefunden</Text>
              <Text style={styles.emptyText}>Versuche andere Filter oder Kategorien.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push(`/(customer)/listings/${item.id}`)}
          >
            <ListingCard listing={item} />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  )
}

function ListingCard({ listing }: { listing: ServiceListing }) {
  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardMeta}>
          <Text style={styles.category}>{listing.category?.name ?? 'Sonstiges'}</Text>
          <Text style={styles.location}>📍 {listing.city} {listing.plz}</Text>
        </View>
        <View style={styles.priceBox}>
          <Text style={styles.price}>{listing.price.toFixed(0)} €</Text>
          <Text style={styles.priceUnit}>
            {listing.pricingModel === 'PER_HOUR' ? '/Std.' : 'Festpr.'}
          </Text>
        </View>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{listing.title}</Text>
      <Text style={styles.cardDesc} numberOfLines={2}>{listing.description}</Text>
      <View style={styles.cardFooter}>
        <View style={styles.providerRow}>
          <Text style={styles.providerName}>
            {listing.provider?.user.displayName ?? ''}
          </Text>
          {(listing.provider?.totalReviews ?? 0) > 0 ? (
            <Text style={styles.rating}>
              ⭐ {listing.provider!.averageRating.toFixed(1)} ({listing.provider!.totalReviews})
            </Text>
          ) : null}
        </View>
        <View style={styles.bookBtn}>
          <Text style={styles.bookBtnText}>Ansehen →</Text>
        </View>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  backBtn: { padding: spacing.xs },
  backText: { fontSize: fontSize.xl, color: colors.primary },
  title: { flex: 1, textAlign: 'center', fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  searchRow: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipsScroll: { flexGrow: 0, flexShrink: 0 },
  chips: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm, alignItems: 'center' },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: fontWeight.medium },
  chipTextActive: { color: colors.textInverse },
  toggleRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: spacing.sm, gap: spacing.sm },
  toggleBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 6,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  toggleBtnActive: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  toggleText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: fontWeight.medium },
  toggleTextActive: { color: colors.textInverse },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  card: { marginBottom: spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs },
  cardMeta: { flex: 1 },
  category: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  location: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  priceBox: { alignItems: 'flex-end' },
  price: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.secondary },
  priceUnit: { fontSize: fontSize.xs, color: colors.textSecondary },
  cardTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  cardDesc: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.sm },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  providerRow: { flex: 1, gap: 2 },
  providerName: { fontSize: fontSize.xs, color: colors.textSecondary },
  rating: { fontSize: fontSize.xs, color: colors.textSecondary },
  bookBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.full },
  bookBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textInverse },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
})
