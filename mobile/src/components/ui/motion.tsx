import React from 'react'
import { Pressable, type ViewStyle, type StyleProp } from 'react-native'
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useReduceMotion } from '../../hooks/useReduceMotion'

// Shared motion vocabulary so screens don't each invent their own timings.
// Kept deliberately small and quick — this is a utility app, animation should
// make state changes legible, not perform.
const DURATION = 260
const STAGGER = 45
const MAX_STAGGER_INDEX = 8

interface AnimatedEntranceProps {
  children: React.ReactNode
  /** Position in a list; used to stagger entrances. */
  index?: number
  style?: StyleProp<ViewStyle>
}

/**
 * Entrance animation for list items and cards. Staggering is capped so a long
 * list doesn't leave the last rows visibly waiting to appear.
 */
export function AnimatedEntrance({ children, index = 0, style }: AnimatedEntranceProps) {
  const reduceMotion = useReduceMotion()

  if (reduceMotion) {
    return <Animated.View style={style}>{children}</Animated.View>
  }

  const delay = Math.min(index, MAX_STAGGER_INDEX) * STAGGER

  return (
    <Animated.View entering={FadeInDown.duration(DURATION).delay(delay)} style={style}>
      {children}
    </Animated.View>
  )
}

/** Plain fade, for content that shouldn't appear to move (banners, empty states). */
export function AnimatedFade({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReduceMotion()

  if (reduceMotion) {
    return <Animated.View style={style}>{children}</Animated.View>
  }

  return (
    <Animated.View entering={FadeIn.duration(DURATION)} style={style}>
      {children}
    </Animated.View>
  )
}

interface PressableScaleProps {
  children: React.ReactNode
  onPress?: () => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  /** How far it compresses. Subtle by default. */
  scaleTo?: number
  accessibilityLabel?: string
  accessibilityRole?: 'button' | 'link'
}

/**
 * Press feedback that makes taps feel physical. Uses a spring so release feels
 * elastic rather than mechanical; falls back to no scaling under reduce motion,
 * where the underlying Pressable still handles the interaction.
 */
export function PressableScale({
  children,
  onPress,
  disabled,
  style,
  scaleTo = 0.97,
  accessibilityLabel,
  accessibilityRole = 'button',
}: PressableScaleProps) {
  const reduceMotion = useReduceMotion()
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => {
        if (!reduceMotion) scale.value = withTiming(scaleTo, { duration: 90 })
      }}
      onPressOut={() => {
        if (!reduceMotion) scale.value = withSpring(1, { damping: 14, stiffness: 260 })
      }}
    >
      <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
    </Pressable>
  )
}
