import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme'
import { formatDate } from '../../utils/date'

interface Props {
  scheduledStartAt?: string
  expectedCompletionAt?: string
  completedAt?: string
}

/**
 * The agreed working window for an order. Rendered only when a schedule was
 * actually agreed — orders created before timeframes existed have neither
 * date, and an empty card would be worse than none.
 */
export function OrderTimeframe({ scheduledStartAt, expectedCompletionAt, completedAt }: Props) {
  if (!scheduledStartAt && !expectedCompletionAt) return null

  const overdue =
    !completedAt && expectedCompletionAt && new Date(expectedCompletionAt) < new Date()

  return (
    <View style={[styles.card, overdue && styles.cardOverdue]}>
      <Text style={styles.label}>Zeitrahmen</Text>

      <View style={styles.row}>
        {scheduledStartAt ? (
          <View style={styles.col}>
            <Text style={styles.colLabel}>Start</Text>
            <Text style={styles.colValue}>{formatDate(scheduledStartAt)}</Text>
          </View>
        ) : null}

        {expectedCompletionAt ? (
          <View style={styles.col}>
            <Text style={styles.colLabel}>Fertig bis</Text>
            <Text style={[styles.colValue, overdue && styles.overdueValue]}>
              {formatDate(expectedCompletionAt)}
            </Text>
          </View>
        ) : null}

        {completedAt ? (
          <View style={styles.col}>
            <Text style={styles.colLabel}>Abgeschlossen</Text>
            <Text style={[styles.colValue, styles.doneValue]}>{formatDate(completedAt)}</Text>
          </View>
        ) : null}
      </View>

      {overdue ? (
        <Text style={styles.overdueNote}>
          ⚠️ Der vereinbarte Termin ist überschritten.
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  cardOverdue: { borderColor: colors.warning, backgroundColor: colors.warningLight },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  col: { minWidth: 90 },
  colLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  colValue: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginTop: 2 },
  overdueValue: { color: colors.warning },
  doneValue: { color: colors.secondary },
  overdueNote: { fontSize: fontSize.xs, color: colors.warning, marginTop: spacing.sm },
})
