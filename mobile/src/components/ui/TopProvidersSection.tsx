import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { providersApi, type TopProvider } from '../../api/providers.api'
import { StarRating } from './StarRating'
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme'

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

/** Horizontal showcase of the best-rated Dienstleister, with their finished-job count. */
export function TopProvidersSection() {
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['top-providers'],
    queryFn: () => providersApi.top({ limit: 10 }).then((r) => r.data.items),
  })

  const providers = data ?? []
  if (!isLoading && providers.length === 0) return null

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Top Dienstleister</Text>
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {providers.map((p, i) => (
            <TopProviderCard
              key={p.id}
              provider={p}
              rank={i + 1}
              onPress={() => router.push(`/providers/${p.id}`)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  )
}

function TopProviderCard({
  provider,
  rank,
  onPress,
}: {
  provider: TopProvider
  rank: number
  onPress: () => void
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.card}>
      {rank <= 3 ? (
        <View style={styles.rankBadge}>
          <Text style={styles.rankBadgeText}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</Text>
        </View>
      ) : null}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(provider.displayName)}</Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>{provider.displayName}</Text>
      {provider.categories[0] ? (
        <Text style={styles.category} numberOfLines={1}>
          {provider.categories[0].icon ?? '🔧'} {provider.categories[0].name}
        </Text>
      ) : null}
      <View style={styles.ratingRow}>
        <StarRating value={provider.averageRating} size={13} />
        <Text style={styles.ratingText}>{provider.averageRating.toFixed(1)}</Text>
      </View>
      <Text style={styles.jobsText}>
        {provider.completedJobsCount} {provider.completedJobsCount === 1 ? 'Auftrag' : 'Aufträge'} abgeschlossen
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md },
  row: { gap: spacing.md, paddingRight: spacing.md },
  card: {
    width: 152,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  rankBadge: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  rankBadgeText: { fontSize: 16 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primary },
  name: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, textAlign: 'center' },
  category: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  ratingText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.text },
  jobsText: { fontSize: fontSize.xs, color: colors.textDisabled, marginTop: 4, textAlign: 'center' },
})
