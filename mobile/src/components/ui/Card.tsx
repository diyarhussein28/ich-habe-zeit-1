import React, { useMemo } from 'react'
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native'
import { radius, spacing, shadow, getAccessibleColors } from '../../constants/theme'
import { useAccessibilityStore } from '../../store/accessibility.store'

interface CardProps {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  elevated?: boolean
}

export function Card({ children, style, elevated = false }: CardProps) {
  const { highContrast } = useAccessibilityStore()
  const styles = useMemo(() => makeStyles(getAccessibleColors(highContrast)), [highContrast])

  return (
    <View style={[styles.card, elevated ? shadow.md : shadow.sm, style]}>
      {children}
    </View>
  )
}

function makeStyles(colors: ReturnType<typeof getAccessibleColors>) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
  })
}
