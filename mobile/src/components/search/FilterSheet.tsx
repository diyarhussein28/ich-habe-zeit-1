import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Button } from '../ui/Button'
import { formatPlzInput } from '../../utils/inputFormat'
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme'

export interface SearchFilters {
  plz?: string
  priceMin?: number
  priceMax?: number
  pricingModel?: 'FIXED_PRICE' | 'PER_HOUR'
  minRating?: number
  verifiedOnly?: boolean
  availableOnly?: boolean
  sort?: string
}

interface Props {
  visible: boolean
  filters: SearchFilters
  /** Sort options differ between listing and provider search. */
  sortOptions: { value: string; label: string }[]
  showPriceFilters?: boolean
  onApply: (filters: SearchFilters) => void
  onClose: () => void
}

const RATINGS = [0, 3, 4, 4.5]

export function FilterSheet({
  visible,
  filters,
  sortOptions,
  showPriceFilters = true,
  onApply,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<SearchFilters>(filters)

  // Re-seed from the applied filters each time it opens, so closing without
  // applying discards the edits rather than silently keeping them.
  useEffect(() => {
    if (visible) setDraft(filters)
  }, [visible, filters])

  const set = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const reset = () => setDraft({ sort: sortOptions[0]?.value })

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text style={styles.title}>Filter</Text>
            <TouchableOpacity onPress={reset}>
              <Text style={styles.resetText}>Zurücksetzen</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Sortieren nach</Text>
            <View style={styles.chipRow}>
              {sortOptions.map((opt) => {
                const active = (draft.sort ?? sortOptions[0]?.value) === opt.value
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => set('sort', opt.value)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={styles.label}>Postleitzahl</Text>
            <TextInput
              style={styles.input}
              value={draft.plz ?? ''}
              onChangeText={(v) => set('plz', formatPlzInput(v) || undefined)}
              placeholder="z.B. 50667"
              keyboardType="number-pad"
              maxLength={5}
              placeholderTextColor={colors.textDisabled}
            />

            {showPriceFilters && (
              <>
                <Text style={styles.label}>Preis (€)</Text>
                <View style={styles.priceRow}>
                  <TextInput
                    style={[styles.input, styles.priceInput]}
                    value={draft.priceMin != null ? String(draft.priceMin) : ''}
                    onChangeText={(v) => set('priceMin', v ? Number(v.replace(/\D/g, '')) : undefined)}
                    placeholder="von"
                    keyboardType="number-pad"
                    placeholderTextColor={colors.textDisabled}
                  />
                  <Text style={styles.priceDash}>–</Text>
                  <TextInput
                    style={[styles.input, styles.priceInput]}
                    value={draft.priceMax != null ? String(draft.priceMax) : ''}
                    onChangeText={(v) => set('priceMax', v ? Number(v.replace(/\D/g, '')) : undefined)}
                    placeholder="bis"
                    keyboardType="number-pad"
                    placeholderTextColor={colors.textDisabled}
                  />
                </View>

                <Text style={styles.label}>Preismodell</Text>
                <View style={styles.chipRow}>
                  {[
                    { value: undefined, label: 'Egal' },
                    { value: 'FIXED_PRICE' as const, label: 'Festpreis' },
                    { value: 'PER_HOUR' as const, label: 'Pro Stunde' },
                  ].map((opt) => {
                    const active = draft.pricingModel === opt.value
                    return (
                      <TouchableOpacity
                        key={opt.label}
                        onPress={() => set('pricingModel', opt.value)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </>
            )}

            <Text style={styles.label}>Mindestbewertung</Text>
            <View style={styles.chipRow}>
              {RATINGS.map((r) => {
                const active = (draft.minRating ?? 0) === r
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => set('minRating', r === 0 ? undefined : r)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {r === 0 ? 'Alle' : `${r.toString().replace('.', ',')}★+`}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchLabelCol}>
                <Text style={styles.switchLabel}>Nur verifizierte Anbieter</Text>
                <Text style={styles.switchHint}>Identität geprüft (KYC)</Text>
              </View>
              <Switch
                value={!!draft.verifiedOnly}
                onValueChange={(v) => set('verifiedOnly', v || undefined)}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchLabelCol}>
                <Text style={styles.switchLabel}>Nur verfügbare Anbieter</Text>
                <Text style={styles.switchHint}>Nimmt aktuell Aufträge an</Text>
              </View>
              <Switch
                value={!!draft.availableOnly}
                onValueChange={(v) => set('availableOnly', v || undefined)}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Button label="Abbrechen" variant="outline" onPress={onClose} fullWidth={false} style={styles.actionBtn} />
            <Button label="Anwenden" onPress={() => onApply(draft)} fullWidth={false} style={styles.actionBtn} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

/** Number of active (non-default) filters — drives the badge on the filter button. */
export function countActiveFilters(f: SearchFilters, defaultSort: string): number {
  let n = 0
  if (f.plz) n++
  if (f.priceMin != null) n++
  if (f.priceMax != null) n++
  if (f.pricingModel) n++
  if (f.minRating != null) n++
  if (f.verifiedOnly) n++
  if (f.availableOnly) n++
  if (f.sort && f.sort !== defaultSort) n++
  return n
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '88%',
  },
  handle: {
    width: 40, height: 4, borderRadius: radius.full,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.sm,
  },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  resetText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },
  label: {
    fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.surface,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priceInput: { flex: 1 },
  priceDash: { color: colors.textSecondary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, color: colors.text },
  chipTextActive: { color: colors.textInverse, fontWeight: fontWeight.semibold },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.lg, gap: spacing.md,
  },
  switchLabelCol: { flex: 1 },
  switchLabel: { fontSize: fontSize.md, color: colors.text },
  switchHint: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  actions: {
    flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg,
    paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
  },
  actionBtn: { flex: 1 },
})
