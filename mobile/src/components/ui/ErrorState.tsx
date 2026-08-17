import React, { useMemo } from 'react'
import { View, Text, StyleSheet, ViewStyle } from 'react-native'
import { spacing, fontSize, fontWeight, getAccessibleColors, scaleFont } from '../../constants/theme'
import { useAccessibilityStore } from '../../store/accessibility.store'
import { getApiErrorMessage } from '../../api/client'
import { Button } from './Button'

interface ErrorStateProps {
  error?: unknown
  message?: string
  onRetry?: () => void
  retrying?: boolean
  style?: ViewStyle
  fullScreen?: boolean
}

export function ErrorState({ error, message, onRetry, retrying, style, fullScreen }: ErrorStateProps) {
  const { largeText, highContrast } = useAccessibilityStore()
  const colors = useMemo(() => getAccessibleColors(highContrast), [highContrast])
  const styles = useMemo(() => makeStyles(colors, largeText), [colors, largeText])

  const detail = message ?? (error ? getApiErrorMessage(error) : undefined)

  return (
    <View style={[styles.container, fullScreen && styles.fullScreen, style]}>
      <Text style={styles.emoji}>⚠️</Text>
      <Text style={styles.title}>Etwas ist schiefgelaufen</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {onRetry ? (
        <Button
          label="Erneut versuchen"
          onPress={onRetry}
          loading={retrying}
          variant="outline"
          fullWidth={false}
          style={styles.retryBtn}
        />
      ) : null}
    </View>
  )
}

function makeStyles(colors: ReturnType<typeof getAccessibleColors>, largeText: boolean) {
  return StyleSheet.create({
    container: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    fullScreen: { flex: 1, backgroundColor: colors.background },
    emoji: { fontSize: 40, marginBottom: spacing.sm },
    title: {
      fontSize: scaleFont(fontSize.md, largeText),
      fontWeight: fontWeight.semibold,
      color: colors.text,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    detail: {
      fontSize: scaleFont(fontSize.sm, largeText),
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.md,
      lineHeight: 20,
    },
    retryBtn: { marginTop: spacing.xs, paddingHorizontal: spacing.xl },
  })
}
