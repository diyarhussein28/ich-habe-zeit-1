import React, { useMemo } from 'react'
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native'
import { spacing, radius, fontSize, fontWeight, getAccessibleColors, scaleFont } from '../../constants/theme'
import { useAccessibilityStore } from '../../store/accessibility.store'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps {
  label: string
  onPress: () => void
  variant?: Variant
  size?: Size
  loading?: boolean
  disabled?: boolean
  fullWidth?: boolean
  style?: ViewStyle
  textStyle?: TextStyle
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  textStyle,
}: ButtonProps) {
  const { largeText, highContrast } = useAccessibilityStore()
  const colors = useMemo(() => getAccessibleColors(highContrast), [highContrast])
  const styles = useMemo(() => makeStyles(colors, largeText), [colors, largeText])
  const isDisabled = disabled || loading

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        styles.base,
        styles[`variant_${variant}`],
        styles[`size_${size}`],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' || variant === 'ghost' ? colors.primary : colors.textInverse}
        />
      ) : (
        <Text
          style={[
            styles.label,
            styles[`labelVariant_${variant}`],
            styles[`labelSize_${size}`],
            textStyle,
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  )
}

function makeStyles(colors: ReturnType<typeof getAccessibleColors>, largeText: boolean) {
  return StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
    },
    fullWidth: { alignSelf: 'stretch' },
    disabled: { opacity: 0.5 },

    // Variants
    variant_primary: { backgroundColor: colors.primary },
    variant_secondary: { backgroundColor: colors.secondary },
    variant_outline: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    variant_ghost: { backgroundColor: 'transparent' },
    variant_danger: { backgroundColor: colors.error },

    // Sizes
    size_sm: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
    size_md: { paddingVertical: 14, paddingHorizontal: spacing.lg },
    size_lg: { paddingVertical: 18, paddingHorizontal: spacing.xl },

    // Labels
    label: { fontWeight: fontWeight.semibold, textAlign: 'center' },
    labelVariant_primary: { color: colors.textInverse },
    labelVariant_secondary: { color: colors.textInverse },
    labelVariant_outline: { color: colors.primary },
    labelVariant_ghost: { color: colors.primary },
    labelVariant_danger: { color: colors.textInverse },
    labelSize_sm: { fontSize: scaleFont(fontSize.sm, largeText) },
    labelSize_md: { fontSize: scaleFont(fontSize.md, largeText) },
    labelSize_lg: { fontSize: scaleFont(fontSize.lg, largeText) },
  })
}
