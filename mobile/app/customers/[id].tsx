import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { customersApi, type CustomerReview } from '../../src/api/customers.api'
import { Card } from '../../src/components/ui/Card'
import { StarRating } from '../../src/components/ui/StarRating'
import { ErrorState } from '../../src/components/ui/ErrorState'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'
import { formatDate } from '../../src/utils/date'

export default function PublicCustomerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const { data: customer, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['public-customer', id],
    queryFn: () => customersApi.get(id).then((r) => r.data.customer),
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

  if (isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ErrorState error={error} onRetry={() => refetch()} retrying={isRefetching} fullScreen />
      </SafeAreaView>
    )
  }

  if (!customer) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Profil nicht gefunden.</Text>
        </View>
      </SafeAreaView>
    )
  }

  const initials = customer.displayName
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
          {customer.profilePhotoUrl ? (
            <Image source={{ uri: customer.profilePhotoUrl }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          <Text style={styles.name}>{customer.displayName}</Text>
          <View style={styles.ratingRow}>
            <StarRating value={customer.averageRating} size={18} />
            <Text style={styles.ratingText}>
              {customer.averageRating.toFixed(1)} ({customer.totalReviews} Bewertungen)
            </Text>
          </View>
          <Text style={styles.memberSince}>Mitglied seit {formatDate(customer.memberSince)}</Text>
        </View>

        {/* Reviews */}
        <View style={styles.card}>
          <Text style={[styles.sectionLabel, styles.sectionLabelOutside]}>Bewertungen ({customer.totalReviews})</Text>
          {customer.reviews.length === 0 ? (
            <Text style={styles.emptyReviewsText}>Noch keine Bewertungen.</Text>
          ) : (
            customer.reviews.map((review) => <ReviewRow key={review.id} review={review} />)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function ReviewRow({ review }: { review: CustomerReview }) {
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
  memberSince: { fontSize: fontSize.xs, color: colors.textDisabled },
  card: { marginBottom: spacing.md },
  sectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  sectionLabelOutside: { marginBottom: spacing.sm, marginLeft: spacing.xs },
  reviewCard: { marginBottom: spacing.sm },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  reviewerName: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text },
  reviewComment: { fontSize: fontSize.sm, color: colors.text, lineHeight: 19, marginBottom: spacing.xs },
  reviewDate: { fontSize: fontSize.xs, color: colors.textDisabled },
  emptyReviewsText: { fontSize: fontSize.sm, color: colors.textDisabled, fontStyle: 'italic' },
})
