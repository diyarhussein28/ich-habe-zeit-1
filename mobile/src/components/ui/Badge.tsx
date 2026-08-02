import React from 'react'
import { View, Text, StyleSheet, ViewStyle } from 'react-native'
import { colors, radius, spacing, fontSize } from '../../constants/theme'

type BadgeColor = 'primary' | 'success' | 'warning' | 'error' | 'neutral'

interface BadgeProps {
  label: string
  color?: BadgeColor
  style?: ViewStyle
}

export function Badge({ label, color = 'neutral', style }: BadgeProps) {
  return (
    <View style={[styles.badge, styles[`bg_${color}`], style]}>
      <Text style={[styles.label, styles[`text_${color}`]]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
  },
  label: { fontSize: fontSize.xs, fontWeight: '600' },
  bg_primary: { backgroundColor: colors.primaryLight },
  bg_success: { backgroundColor: colors.secondaryLight },
  bg_warning: { backgroundColor: colors.warningLight },
  bg_error: { backgroundColor: colors.errorLight },
  bg_neutral: { backgroundColor: colors.border },
  text_primary: { color: colors.primary },
  text_success: { color: colors.secondary },
  text_warning: { color: colors.warning },
  text_error: { color: colors.error },
  text_neutral: { color: colors.textSecondary },
})
