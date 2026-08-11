import React from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { categoriesApi, type ProviderSummary } from '../../../src/api/categories.api'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { Button } from '../../../src/components/ui/Button'
import { StarRating } from '../../../src/components/ui/StarRating'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'

export default function BrowseCategoryScreen() {
  const { categoryId, categoryName } = useLocalSearchParams<{ categoryId: string; categoryName: string }>()
  const router = useRouter()

  const { data: providers, isLoading } = useQuery({
    queryKey: ['category-providers', categoryId],
    queryFn: () => categoriesApi.listProviders(categoryId).then((r) => r.data.providers),
    enabled: !!categoryId,
  })

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Zurück</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={providers ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>{categoryName}</Text>
            <Text style={styles.subtitle}>Verfügbare Dienstleister in deiner Nähe</Text>

            <Button
              label="+ Eigenen Auftrag erstellen"
              onPress={() =>
                router.push({
                  pathname: '/requests/create',
                  params: { categoryId, categoryName },
                })
              }
              style={styles.createBtn}
            />

            {isLoading && (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            )}

            {!isLoading && providers?.length === 0 && (
              <Card style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Noch keine Dienstleister verfügbar</Text>
                <Text style={styles.emptyText}>
                  Erstelle einen Auftrag — passende Dienstleister melden sich mit einem Angebot bei dir.
                </Text>
              </Card>
            )}

            {(providers?.length ?? 0) > 0 && (
              <Text style={styles.sectionLabel}>
                {providers!.length} Dienstleister gefunden
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => <ProviderCard provider={item} />}
      />
    </SafeAreaView>
  )
}

function ProviderCard({ provider }: { provider: ProviderSummary }) {
  const initials = provider.displayName
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <Card style={styles.card}>
      <View style={styles.cardRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.providerName}>{provider.displayName}</Text>
          <View style={styles.ratingRow}>
            <StarRating value={provider.averageRating} size={14} />
            <Text style={styles.ratingText}>
              {provider.averageRating.toFixed(1)} ({provider.totalReviews} Bewertungen)
            </Text>
          </View>
          {provider.languages.length > 0 && (
            <Text style={styles.languages}>🌍 {provider.languages.join(', ')}</Text>
          )}
        </View>
        <Badge label="Verfügbar" color="success" />
      </View>
      {provider.bio ? (
        <Text style={styles.bio} numberOfLines={2}>{provider.bio}</Text>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  backBtn: { alignSelf: 'flex-start' },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.medium },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },
  createBtn: { marginBottom: spacing.lg },
  sectionLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyCard: { marginBottom: spacing.lg },
  emptyTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  card: { marginBottom: spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textInverse },
  cardInfo: { flex: 1 },
  providerName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
  ratingText: { fontSize: fontSize.xs, color: colors.textSecondary },
  languages: { fontSize: fontSize.xs, color: colors.textSecondary },
  bio: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 18 },
})
