import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SafeAreaView } from 'react-native-safe-area-context'
import { listingsApi } from '../../../src/api/listings.api'
import { Button } from '../../../src/components/ui/Button'
import { getApiErrorMessage } from '../../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'
import { formatEur } from '../../../src/utils/currency'

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const [bookError, setBookError] = useState<string | null>(null)
  const [booked, setBooked] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => listingsApi.getById(id!).then((r) => r.data.listing),
    enabled: !!id,
  })

  const bookMutation = useMutation({
    mutationFn: () => listingsApi.book(id!),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['customer-orders'] })
      setBooked(true)
      setBookError(null)
      setTimeout(() => {
        router.push('/(customer)/orders')
      }, 1500)
    },
    onError: (err) => setBookError(getApiErrorMessage(err)),
  })

  if (isLoading || !data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    )
  }

  const listing = data

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{listing.title}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Category + location */}
        <View style={styles.meta}>
          <Text style={styles.category}>{listing.category?.name ?? 'Sonstiges'}</Text>
          <Text style={styles.location}>📍 {listing.city} · {listing.plz}</Text>
        </View>

        {/* Title + price */}
        <Text style={styles.title}>{listing.title}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatEur(listing.price)}</Text>
          <Text style={styles.priceUnit}>
            {listing.pricingModel === 'PER_HOUR' ? ' / Stunde' : ' Festpreis'}
          </Text>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Beschreibung</Text>
          <Text style={styles.description}>{listing.description}</Text>
        </View>

        {/* Provider info */}
        {listing.provider && (
          <TouchableOpacity
            onPress={() => router.push(`/providers/${listing.provider!.id}`)}
            activeOpacity={0.85}
            style={styles.providerCard}
          >
            <View style={styles.providerAvatar}>
              <Text style={styles.providerAvatarText}>
                {listing.provider.user.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.providerInfo}>
              <Text style={styles.providerName}>{listing.provider.user.displayName}</Text>
              {listing.provider.totalReviews > 0 ? (
                <Text style={styles.providerRating}>
                  ⭐ {listing.provider.averageRating.toFixed(1)} · {listing.provider.totalReviews} Bewertungen
                </Text>
              ) : (
                <Text style={styles.providerRating}>Noch keine Bewertungen</Text>
              )}
              {listing.provider.bio ? (
                <Text style={styles.providerBio} numberOfLines={3}>{listing.provider.bio}</Text>
              ) : null}
              <Text style={styles.providerLink}>Profil ansehen →</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Stats */}
        <Text style={styles.viewCount}>{listing.viewCount} Aufrufe</Text>
      </ScrollView>

      {/* Bottom action */}
      <View style={styles.bottomBar}>
        {booked ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>✓ Gebucht! Weiterleitung zu Buchungen...</Text>
          </View>
        ) : (
          <>
            {bookError ? (
              <Text style={styles.errorText}>{bookError}</Text>
            ) : null}
            <Button
              label={bookMutation.isPending ? 'Wird gebucht...' : 'Jetzt buchen'}
              onPress={() => {
                setBookError(null)
                bookMutation.mutate()
              }}
              loading={bookMutation.isPending}
              fullWidth
            />
          </>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs },
  backText: { fontSize: fontSize.xl, color: colors.primary },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  content: { padding: spacing.lg, paddingBottom: 100 },
  meta: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  category: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  location: { fontSize: fontSize.xs, color: colors.textSecondary },
  title: { fontSize: fontSize.xxl ?? 24, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm, lineHeight: 30 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: spacing.lg },
  price: { fontSize: 28, fontWeight: fontWeight.bold, color: colors.secondary },
  priceUnit: { fontSize: fontSize.md, color: colors.textSecondary, marginLeft: 4 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm },
  description: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 24 },
  providerCard: {
    flexDirection: 'row', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  providerAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  providerAvatarText: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.textInverse },
  providerInfo: { flex: 1 },
  providerName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  providerRating: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  providerBio: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 20 },
  providerLink: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold, marginTop: spacing.xs },
  viewCount: { fontSize: fontSize.xs, color: colors.textDisabled, textAlign: 'center' },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surface, padding: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingBottom: spacing.xl,
  },
  successBanner: {
    backgroundColor: '#dcfce7', borderColor: '#16a34a', borderWidth: 1,
    padding: spacing.md, borderRadius: radius.lg, alignItems: 'center',
  },
  successText: { fontSize: fontSize.md, color: '#15803d', fontWeight: fontWeight.semibold },
  errorText: { fontSize: fontSize.sm, color: colors.error, marginBottom: spacing.sm, textAlign: 'center' },
})
