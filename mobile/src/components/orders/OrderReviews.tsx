import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { StarRating } from '../ui/StarRating'
import type { OrderRating } from '../../api/types'
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme'
import { formatDate } from '../../utils/date'

interface Props {
  ratings: OrderRating[]
  /** Controls the wording: whose review is "yours" from here. */
  viewerIsCustomer: boolean
}

const DIRECTION_LABEL: Record<OrderRating['direction'], string> = {
  CUSTOMER_TO_PROVIDER: 'Auftraggeber bewertet',
  PROVIDER_TO_CUSTOMER: 'Dienstleister bewertet',
}

/**
 * Both sides' reviews for a finished order, shown on the order itself so the
 * feedback lives with the job it belongs to rather than only on a profile.
 */
export function OrderReviews({ ratings, viewerIsCustomer }: Props) {
  if (ratings.length === 0) return null

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>Bewertungen</Text>
      {ratings.map((rating) => {
        const isOwn =
          (viewerIsCustomer && rating.direction === 'CUSTOMER_TO_PROVIDER') ||
          (!viewerIsCustomer && rating.direction === 'PROVIDER_TO_CUSTOMER')

        return (
          <View key={rating.id} style={[styles.card, isOwn && styles.cardOwn]}>
            <View style={styles.head}>
              <Text style={styles.direction}>
                {DIRECTION_LABEL[rating.direction]}
                {isOwn ? ' (deine)' : ''}
              </Text>
              <StarRating value={rating.score} size={14} />
            </View>
            <Text style={styles.reviewer}>{rating.reviewerName}</Text>
            {rating.comment ? <Text style={styles.comment}>{rating.comment}</Text> : null}
            <Text style={styles.date}>{formatDate(rating.createdAt)}</Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  cardOwn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  direction: { flexShrink: 1, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  reviewer: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginTop: spacing.xs },
  comment: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20, marginTop: spacing.xs },
  date: { fontSize: fontSize.xs, color: colors.textDisabled, marginTop: spacing.xs },
})
