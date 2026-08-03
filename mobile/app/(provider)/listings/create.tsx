import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { listingsApi } from '../../../src/api/listings.api'
import { categoriesApi } from '../../../src/api/categories.api'
import { Input } from '../../../src/components/ui/Input'
import { Button } from '../../../src/components/ui/Button'
import { getApiErrorMessage } from '../../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'
import type { ServiceCategory } from '../../../src/api/types'

export default function CreateListingScreen() {
  const router = useRouter()
  const qc = useQueryClient()

  const [categoryId, setCategoryId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [pricingModel, setPricingModel] = useState<'FIXED_PRICE' | 'PER_HOUR'>('FIXED_PRICE')
  const [city, setCity] = useState('')
  const [plz, setPlz] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data.categories),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      listingsApi.create({
        categoryId,
        title: title.trim(),
        description: description.trim(),
        price: parseFloat(price),
        pricingModel,
        city: city.trim(),
        plz: plz.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-listings'] })
      router.replace('/(provider)/listings')
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  function validate() {
    if (!categoryId) return 'Bitte eine Kategorie wählen.'
    if (title.trim().length < 3) return 'Titel muss mindestens 3 Zeichen haben.'
    if (description.trim().length < 20) return 'Beschreibung muss mindestens 20 Zeichen haben.'
    if (!price || parseFloat(price) <= 0) return 'Bitte einen gültigen Preis eingeben.'
    if (!city.trim()) return 'Bitte eine Stadt eingeben.'
    if (!/^\d{5}$/.test(plz.trim())) return 'PLZ muss 5 Ziffern haben.'
    return null
  }

  function handleSubmit() {
    const err = validate()
    if (err) { setError(err); return }
    setError(null)
    createMutation.mutate()
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Inserat erstellen</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>

          {/* Category */}
          <Text style={styles.label}>Kategorie *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {(categories ?? []).map((cat: ServiceCategory) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.chip, categoryId === cat.id && styles.chipActive]}
                onPress={() => setCategoryId(cat.id)}
              >
                <Text style={[styles.chipText, categoryId === cat.id && styles.chipTextActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Pricing model */}
          <Text style={styles.label}>Preismodell *</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, pricingModel === 'FIXED_PRICE' && styles.toggleBtnActive]}
              onPress={() => setPricingModel('FIXED_PRICE')}
            >
              <Text style={[styles.toggleText, pricingModel === 'FIXED_PRICE' && styles.toggleTextActive]}>
                Festpreis
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, pricingModel === 'PER_HOUR' && styles.toggleBtnActive]}
              onPress={() => setPricingModel('PER_HOUR')}
            >
              <Text style={[styles.toggleText, pricingModel === 'PER_HOUR' && styles.toggleTextActive]}>
                Stundenlohn
              </Text>
            </TouchableOpacity>
          </View>

          <Input
            label={`Preis (€)${pricingModel === 'PER_HOUR' ? ' pro Stunde' : ''} *`}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="z.B. 80"
            rightIcon={<Text style={{ color: colors.textSecondary, fontSize: fontSize.md }}>€</Text>}
          />

          <Input
            label="Titel *"
            value={title}
            onChangeText={setTitle}
            placeholder="z.B. Professionelle Gebäudereinigung"
            maxLength={100}
          />

          <Input
            label="Beschreibung *"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            style={styles.textArea}
            placeholder="Beschreibe deine Dienstleistung — was bietest du an, was ist inklusive, Erfahrung etc."
            maxLength={2000}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Input
                label="Stadt *"
                value={city}
                onChangeText={setCity}
                placeholder="München"
              />
            </View>
            <View style={styles.plzField}>
              <Input
                label="PLZ *"
                value={plz}
                onChangeText={setPlz}
                keyboardType="numeric"
                placeholder="80331"
                maxLength={5}
              />
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button
            label="Inserat veröffentlichen"
            onPress={handleSubmit}
            loading={createMutation.isPending}
            fullWidth
            style={styles.submitBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs },
  backText: { fontSize: fontSize.xl, color: colors.primary },
  title: { flex: 1, textAlign: 'center', fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  form: { padding: spacing.lg, paddingBottom: spacing.xxl },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm },
  categoryScroll: { marginBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, marginRight: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium },
  chipTextActive: { color: colors.textInverse },
  toggleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  toggleBtn: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium },
  toggleTextActive: { color: colors.textInverse },
  textArea: { height: 100, paddingTop: 14 },
  row: { flexDirection: 'row', gap: spacing.md },
  plzField: { width: 110 },
  errorBox: {
    backgroundColor: '#fee2e2', borderColor: colors.error, borderWidth: 1,
    padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md,
  },
  errorText: { fontSize: fontSize.sm, color: colors.error },
  submitBtn: { marginTop: spacing.sm },
})
