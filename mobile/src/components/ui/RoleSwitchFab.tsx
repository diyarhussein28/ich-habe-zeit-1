import React from 'react'
import { TouchableOpacity, Text, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme'

export function RoleSwitchFab({
  label,
  emoji,
  href,
  bottomOffset,
  replace = true,
}: {
  label: string
  emoji: string
  href: '/(customer)' | '/(provider)' | '/become-provider'
  bottomOffset: number
  replace?: boolean
}) {
  const router = useRouter()
  return (
    <TouchableOpacity
      onPress={() => (replace ? router.replace(href) : router.push(href))}
      style={[styles.fab, { bottom: bottomOffset }]}
      activeOpacity={0.85}
    >
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  emoji: { fontSize: 14 },
  label: { color: colors.textInverse, fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
})
