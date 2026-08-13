import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import type { ListingPackage, PackageTier } from '../../api/listings.api'
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme'
import { formatEur } from '../../utils/currency'

const TIER_LABEL: Record<PackageTier, string> = {
  BASIC: 'Basis',
  STANDARD: 'Standard',
  PREMIUM: 'Premium',
}

interface Props {
  packages: ListingPackage[]
  selectedTier: PackageTier | null
  onSelect: (pkg: ListingPackage) => void
}

/**
 * Horizontal tier selector shown on a listing that defines packages.
 * Listings without packages fall back to their flat price, so this renders
 * nothing rather than an empty shell.
 */
export function PackagePicker({ packages, selectedTier, onSelect }: Props) {
  if (packages.length === 0) return null

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>Pakete</Text>

      <View style={styles.tabs}>
        {packages.map((pkg) => {
          const active = pkg.tier === selectedTier
          return (
            <TouchableOpacity
              key={pkg.id}
              onPress={() => onSelect(pkg)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {TIER_LABEL[pkg.tier]}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {packages
        .filter((p) => p.tier === selectedTier)
        .map((pkg) => (
          <View key={pkg.id} style={styles.detail}>
            <View style={styles.detailHead}>
              <Text style={styles.detailTitle}>{pkg.title}</Text>
              <Text style={styles.detailPrice}>{formatEur(pkg.price)}</Text>
            </View>
            <Text style={styles.detailDesc}>{pkg.description}</Text>
            <Text style={styles.delivery}>
              ⏱ Lieferung in {pkg.deliveryDays} Tag{pkg.deliveryDays !== 1 ? 'en' : ''}
            </Text>
            {pkg.features.length > 0 ? (
              <View style={styles.features}>
                {pkg.features.map((f, i) => (
                  <View key={`${pkg.id}-${i}`} style={styles.featureRow}>
                    <Text style={styles.featureCheck}>✓</Text>
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: radius.full,
    padding: 3,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.full },
  tabActive: { backgroundColor: colors.surface },
  tabText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium },
  tabTextActive: { color: colors.text, fontWeight: fontWeight.bold },
  detail: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  detailHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  detailTitle: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  detailPrice: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.secondary },
  detailDesc: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs },
  delivery: { fontSize: fontSize.sm, color: colors.text, marginTop: spacing.sm, fontWeight: fontWeight.medium },
  features: { marginTop: spacing.sm, gap: spacing.xs },
  featureRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  featureCheck: { color: colors.secondary, fontWeight: fontWeight.bold },
  featureText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 19 },
})
