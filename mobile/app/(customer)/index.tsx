import React, { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { categoriesApi } from '../../src/api/categories.api'
import { Card } from '../../src/components/ui/Card'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { useAuthStore } from '../../src/store/auth.store'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'
import type { ServiceCategory } from '../../src/api/types'

export default function CustomerHomeScreen() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const { data: categories, isLoading: catsLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data.categories),
  })

  const filtered = categories?.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hallo, {user?.displayName} 👋</Text>
          <Text style={styles.subgreeting}>Was suchst du heute?</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(customer)/requests/create')} style={styles.postBtn}>
          <Text style={styles.postBtnText}>+ Auftrag</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrapper}>
        <TextInput
          style={styles.searchInput}
          placeholder="Dienstleistung suchen..."
          placeholderTextColor={colors.textDisabled}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      <FlatList
        data={filtered ?? []}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Text style={styles.sectionTitle}>Kategorien</Text>
        }
        ListEmptyComponent={
          catsLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Keine Kategorien gefunden</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <CategoryCard
            category={item}
            selected={selectedCategory === item.id}
            onPress={() => {
              setSelectedCategory(item.id === selectedCategory ? null : item.id)
              router.push({
                pathname: '/(customer)/requests/create',
                params: { categoryId: item.id, categoryName: item.name },
              })
            }}
          />
        )}
      />
    </SafeAreaView>
  )
}

function CategoryCard({
  category,
  selected,
  onPress,
}: {
  category: ServiceCategory
  selected: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.catCard, selected ? styles.catCardSelected : null]}
    >
      <Text style={styles.catIcon}>{category.icon ?? '🔧'}</Text>
      <Text style={styles.catName} numberOfLines={2}>
        {category.name}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  greeting: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  subgreeting: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  postBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  postBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textInverse },
  searchWrapper: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: fontSize.md,
    color: colors.text,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  row: { gap: spacing.md, marginBottom: spacing.md },
  catCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    minHeight: 100,
    justifyContent: 'center',
  },
  catCardSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  catIcon: { fontSize: 36, marginBottom: spacing.sm },
  catName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.text,
    textAlign: 'center',
  },
  empty: { alignItems: 'center', paddingTop: spacing.xl },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary },
})
