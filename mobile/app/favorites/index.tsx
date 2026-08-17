import React, { useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { favoritesApi, type FavoriteProvider, type FavoriteListing } from '../../src/api/favorites.api'
import { Card } from '../../src/components/ui/Card'
import { StarRating } from '../../src/components/ui/StarRating'
import { ErrorState } from '../../src/components/ui/ErrorState'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'
import { formatEur } from '../../src/utils/currency'

type Tab = 'providers' | 'listings'

export default function FavoritesScreen() {
  const router = useRouter()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('providers')

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['favorites-mine'],
    queryFn: () => favoritesApi.getMine().then((r) => r.data),
  })

  const removeProviderMutation = useMutation({
    mutationFn: (id: string) => favoritesApi.removeProvider(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites-mine'] }),
  })
  const removeListingMutation = useMutation({
    mutationFn: (id: string) => favoritesApi.removeListing(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites-mine'] }),
  })

  const providers = data?.providers ?? []
  const listings = data?.listings ?? []

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Meine Favoriten</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'providers' && styles.tabActive]} onPress={() => setTab('providers')}>
          <Text style={[styles.tabText, tab === 'providers' && styles.tabTextActive]}>Dienstleister ({providers.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'listings' && styles.tabActive]} onPress={() => setTab('listings')}>
          <Text style={[styles.tabText, tab === 'listings' && styles.tabTextActive]}>Inserate ({listings.length})</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} retrying={isRefetching} style={{ marginTop: spacing.xl }} />
      ) : tab === 'providers' ? (
        <FlatList
          data={providers}
          keyExtractor={(p) => p.favoriteId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🤍</Text>
              <Text style={styles.emptyText}>Noch keine gespeicherten Dienstleister.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <ProviderRow
              provider={item}
              onPress={() => router.push(`/providers/${item.id}`)}
              onRemove={() => removeProviderMutation.mutate(item.id)}
            />
          )}
        />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(l) => l.favoriteId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🤍</Text>
              <Text style={styles.emptyText}>Noch keine gespeicherten Inserate.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <ListingRow
              listing={item}
              onPress={() => router.push(`/(customer)/listings/${item.id}`)}
              onRemove={() => removeListingMutation.mutate(item.id)}
            />
          )}
        />
      )}
    </SafeAreaView>
  )
}

function ProviderRow({
  provider,
  onPress,
  onRemove,
}: {
  provider: FavoriteProvider
  onPress: () => void
  onRemove: () => void
}) {
  const initials = provider.displayName.split(' ').map((w) => w[0] ?? '').slice(0, 2).join('').toUpperCase()
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Card style={styles.row}>
        {provider.profilePhotoUrl ? (
          <Image source={{ uri: provider.profilePhotoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>{provider.displayName}</Text>
          <View style={styles.ratingRow}>
            <StarRating value={provider.averageRating} size={13} />
            <Text style={styles.ratingText}>{provider.averageRating.toFixed(1)} ({provider.totalReviews})</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.removeText}>❤️</Text>
        </TouchableOpacity>
      </Card>
    </TouchableOpacity>
  )
}

function ListingRow({
  listing,
  onPress,
  onRemove,
}: {
  listing: FavoriteListing
  onPress: () => void
  onRemove: () => void
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Card style={styles.row}>
        {listing.photoUrls?.[0] ? (
          <Image source={{ uri: listing.photoUrls[0] }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>🔧</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>{listing.title}</Text>
          <Text style={styles.listingPrice}>
            {formatEur(listing.price)}{listing.pricingModel === 'PER_HOUR' ? ' /Std.' : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.removeText}>❤️</Text>
        </TouchableOpacity>
      </Card>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  backText: { fontSize: fontSize.sm, color: colors.primary },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.sm },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium },
  tabTextActive: { color: colors.textInverse },
  list: { padding: spacing.lg, paddingTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  avatar: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.border },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  avatarText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primary },
  rowTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  ratingText: { fontSize: fontSize.xs, color: colors.textSecondary },
  listingPrice: { fontSize: fontSize.sm, color: colors.secondary, fontWeight: fontWeight.semibold },
  removeText: { fontSize: 20 },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary },
})
