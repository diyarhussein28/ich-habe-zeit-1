import React, { useState } from 'react'
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { ratingsApi } from '../api/ratings.api'
import { StarRating } from './ui/StarRating'
import { Button } from './ui/Button'
import { colors, spacing, fontSize, fontWeight, radius } from '../constants/theme'
import { formatDate } from '../utils/date'

// Shows "<Rolle> bewerten" while eligible and not yet rated; once the current
// user has submitted a rating for this order, switches to a read-only
// "<Rolle> bewertet ✓" badge that just shows what they gave — no edit options.
export function RatingButton({
  orderId,
  eligible,
  targetRoleLabel,
  onOpenRate,
}: {
  orderId: string
  eligible: boolean
  targetRoleLabel: string
  onOpenRate: () => void
}) {
  const [showMine, setShowMine] = useState(false)

  const { data: myRating, isLoading } = useQuery({
    queryKey: ['my-rating', orderId],
    queryFn: () => ratingsApi.getMine(orderId).then((r) => r.data.rating),
    enabled: eligible,
  })

  if (!eligible || isLoading) return null

  if (myRating) {
    return (
      <>
        <TouchableOpacity onPress={() => setShowMine(true)} style={styles.ratedBadge}>
          <Text style={styles.ratedBadgeText}>{targetRoleLabel} bewertet ✓</Text>
        </TouchableOpacity>

        <Modal visible={showMine} animationType="fade" transparent onRequestClose={() => setShowMine(false)}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <Text style={styles.title}>Deine Bewertung</Text>
              <View style={styles.starsRow}>
                <StarRating value={myRating.score} size={32} />
              </View>
              {myRating.comment ? <Text style={styles.comment}>{myRating.comment}</Text> : null}
              <Text style={styles.date}>Abgegeben am {formatDate(myRating.createdAt)}</Text>
              <Button label="Schließen" variant="outline" onPress={() => setShowMine(false)} style={styles.closeBtn} />
            </View>
          </View>
        </Modal>
      </>
    )
  }

  return (
    <Button label={`${targetRoleLabel} bewerten`} variant="outline" onPress={onOpenRate} />
  )
}

const styles = StyleSheet.create({
  ratedBadge: {
    alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md,
    backgroundColor: colors.secondaryLight, borderWidth: 1, borderColor: colors.secondary,
  },
  ratedBadgeText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.5)', padding: spacing.lg },
  sheet: { width: '100%', backgroundColor: colors.background, borderRadius: radius.xl, padding: spacing.lg, alignItems: 'center' },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md },
  starsRow: { marginBottom: spacing.md },
  comment: { fontSize: fontSize.sm, color: colors.text, textAlign: 'center', lineHeight: 20, marginBottom: spacing.sm },
  date: { fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: spacing.lg },
  closeBtn: { alignSelf: 'stretch' },
})
