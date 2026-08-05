import React, { useState, forwardRef, useMemo } from 'react'
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native'
import { spacing, radius, fontSize, getAccessibleColors, scaleFont } from '../../constants/theme'
import { useAccessibilityStore } from '../../store/accessibility.store'

interface InputProps extends TextInputProps {
  label?: string
  error?: string
  hint?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  onRightIconPress?: () => void
  containerStyle?: ViewStyle
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, leftIcon, rightIcon, onRightIconPress, containerStyle, style, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false)
  const { largeText, highContrast } = useAccessibilityStore()
  const colors = useMemo(() => getAccessibleColors(highContrast), [highContrast])
  const styles = useMemo(() => makeStyles(colors, largeText), [colors, largeText])

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrapper,
          focused && styles.inputWrapperFocused,
          error ? styles.inputWrapperError : null,
        ]}
      >
        {leftIcon ? <View style={styles.iconLeft}>{leftIcon}</View> : null}
        <TextInput
          ref={ref}
          style={[styles.input, leftIcon ? styles.inputWithLeft : null, style]}
          placeholderTextColor={colors.textDisabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {rightIcon ? (
          <TouchableOpacity
            onPress={onRightIconPress}
            disabled={!onRightIconPress}
            style={styles.iconRight}
          >
            {rightIcon}
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  )
})

function makeStyles(colors: ReturnType<typeof getAccessibleColors>, largeText: boolean) {
  return StyleSheet.create({
    container: { marginBottom: spacing.md },
    label: {
      fontSize: scaleFont(fontSize.sm, largeText),
      fontWeight: '500',
      color: colors.text,
      marginBottom: spacing.xs,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.md,
    },
    inputWrapperFocused: { borderColor: colors.borderFocus },
    inputWrapperError: { borderColor: colors.error },
    input: {
      flex: 1,
      paddingVertical: 14,
      paddingHorizontal: spacing.md,
      fontSize: scaleFont(fontSize.md, largeText),
      color: colors.text,
    },
    inputWithLeft: { paddingLeft: spacing.xs },
    iconLeft: { paddingLeft: spacing.md },
    iconRight: { paddingRight: spacing.md },
    error: { marginTop: spacing.xs, fontSize: scaleFont(fontSize.sm, largeText), color: colors.error },
    hint: { marginTop: spacing.xs, fontSize: scaleFont(fontSize.sm, largeText), color: colors.textSecondary },
  })
}
