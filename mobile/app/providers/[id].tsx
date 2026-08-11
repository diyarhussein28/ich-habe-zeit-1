import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { providersApi, type ProviderReview } from '../../src/api/providers.api'
import { Card } from '../../src/components/ui/Card'
import { Badge } from '../../src/components/ui/Badge'
import { StarRating } from '../../src/components/ui/StarRating'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'
import { formatDate } from '../../src/utils/date'
import type { ServiceListing } from '../../src/api/listings.api'

export default function PublicProviderProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const { data: provider, isLoading } = useQuery({
    queryKey: ['public-provider', id],
    queryFn: () => providersApi.get(id).then((r) => r.data.provider),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (!provider) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Profil nicht gefunden.</Text>
        </View>
      </SafeAreaView>
    )
  }

  const initials = provider.displayName
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Zurück</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Identity */}
        <View style={styles.identity}>
          {provider.profilePhotoUrl ? (
            <Image source={{ uri: provider.profilePhotoUrl }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          <Text style={styles.name}>{provider.displayName}</Text>
          <View style={styles.ratingRow}>
            <StarRating value={provider.averageRating} size={18} />
            <Text style={styles.ratingText}>
              {provider.averageRating.toFixed(1)} ({provider.totalReviews} Bewertungen)
            </Text>
          </View>
          <View style={styles.badgeRow}>
            <Badge label={provider.isAvailable ? '● Verfügbar' : '● Ausgebucht'} color={provider.isAvailable ? 'success' : 'neutral'} />
            <Text style={styles.memberSince}>Mitglied seit {formatDate(provider.memberSince)}</Text>
          </View>
        </View>

        {/* Bio */}
        {provider.bio ? (
          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>Über mich</Text>
            <Text style={styles.bioText}>{provider.bio}</Text>
          </Card>
        ) : null}

        {/* Expertise */}
        {provider.categories.length > 0 && (
          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>Expertise</Text>
            <View style={styles.chipRow}>
              {provider.categories.map((c) => (
                <View key={c.id} style={styles.chip}>
                  <Text style={styles.chipText}>{c.icon ?? '🔧'} {c.name}{c.isVerified ? ' ✓' : ''}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Languages */}
        {provider.languages.length > 0 && (
          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>Sprachen</Text>
            <View style={styles.chipRow}>
              {provider.languages.map((lang) => (
                <View key={lang} style={styles.chip}>
                  <Text style={styles.chipText}>{lang}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Portfolio */}
        {provider.servicePhotoUrls.length > 0 && (
          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>Portfolio</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.portfolioScroll}>
              {provider.servicePhotoUrls.map((url) => (
                <Image key={url} source={{ uri: url }} style={styles.portfolioImg} />
              ))}
            </ScrollView>
          </Card>
        )}

        {/* Listings */}
        {provider.listings.length > 0 && (
          <View style={styles.card}>
            <Text style={[styles.sectionLabel, styles.sectionLabelOutside]}>Aktuelle Inserate</Text>
            {provider.listings.map((listing) => (
              <ListingRow key={listing.id} listing={listing} onPress={() => router.push(`/(customer)/listings/${listing.id}`)} />
            ))}
          </View>
        )}

        {/* Reviews */}
        <View style={styles.card}>
          <Text style={[styles.sectionLabel, styles.sectionLabelOutside]}>Bewertungen ({provider.totalReviews})</Text>
          {provider.reviews.length === 0 ? (
            <Text style={styles.emptyReviewsText}>Noch keine Bewertungen.</Text>
          ) : (
            provider.reviews.map((review) => <ReviewRow key={review.id} review={review} />)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function ListingRow({ listing, onPress }: { listing: ServiceListing; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Card style={styles.listingCard}>
        <Text style={styles.listingTitle} numberOfLines={1}>{listing.title}</Text>
        <Text style={styles.listingPrice}>
          {listing.price.toFixed(0)} € {listing.pricingModel === 'PER_HOUR' ? '/Std.' : ''}
        </Text>
      </Card>
    </TouchableOpacity>
  )
}

function ReviewRow({ review }: { review: ProviderReview }) {
  return (
    <Card style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <Text style={styles.reviewerName}>{review.reviewerName}</Text>
        <StarRating value={review.score} size={14} />
      </View>
      {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
      <Text style={styles.reviewDate}>{formatDate(review.createdAt)}</Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.medium },
  content: { padding: spacing.lg, paddingTop: 0 },
  identity: { alignItems: 'center', marginBottom: spacing.lg },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  avatarImg: { width: 84, height: 84, borderRadius: 42, marginBottom: spacing.sm, backgroundColor: colors.border },
  avatarText: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.textInverse },
  name: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  ratingText: { fontSize: fontSize.sm, color: colors.textSecondary },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  memberSince: { fontSize: fontSize.xs, color: colors.textDisabled },
  card: { marginBottom: spacing.md },
  sectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  sectionLabelOutside: { marginBottom: spacing.sm, marginLeft: spacing.xs },
  bioText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipText: { fontSize: fontSize.xs, color: colors.text, fontWeight: fontWeight.medium },
  portfolioScroll: { flexGrow: 0, flexShrink: 0 },
  portfolioImg: { width: 120, height: 120, borderRadius: radius.md, marginRight: spacing.sm, backgroundColor: colors.border },
  listingCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  listingTitle: { flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginRight: spacing.sm },
  listingPrice: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.secondary },
  reviewCard: { marginBottom: spacing.sm },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  reviewerName: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text },
  reviewComment: { fontSize: fontSize.sm, color: colors.text, lineHeight: 19, marginBottom: spacing.xs },
  reviewDate: { fontSize: fontSize.xs, color: colors.textDisabled },
  emptyReviewsText: { fontSize: fontSize.sm, color: colors.textDisabled, fontStyle: 'italic' },
})
