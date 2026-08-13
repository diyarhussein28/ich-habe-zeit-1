import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../src/components/ui/Button'
import { Input } from '../../src/components/ui/Input'
import { categoriesApi } from '../../src/api/categories.api'
import { requestsApi } from '../../src/api/requests.api'
import { getApiErrorMessage } from '../../src/api/client'
import { usePlzLookup } from '../../src/hooks/usePlzLookup'
import { formatPlzInput } from '../../src/utils/inputFormat'
import { useAuthStore } from '../../src/store/auth.store'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'

export default function CreateRequestScreen() {
  const router = useRouter()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const params = useLocalSearchParams<{ categoryId?: string; categoryName?: string }>()

  const [categoryId, setCategoryId] = useState(params.categoryId ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [plz, setPlz] = useState('')
  const [city, setCity] = useState('')
  const [budget, setBudget] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [apiError, setApiError] = useState<string | null>(null)

  // Fill the city from the PLZ so the user doesn't have to type it. Tracked per
  // PLZ so a manual correction survives re-renders but a new PLZ refills.
  const { city: resolvedCity } = usePlzLookup(plz)
  const autofilledFor = useRef<string | null>(null)
  useEffect(() => {
    if (resolvedCity && autofilledFor.current !== plz) {
      autofilledFor.current = plz
      setCity(resolvedCity)
      setErrors((e) => ({ ...e, city: '' }))
    }
  }, [resolvedCity, plz])

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data.categories),
  })

  const mutation = useMutation({
    mutationFn: (publish: boolean) =>
      requestsApi
        .create({
          categoryId,
          title: title.trim(),
          description: description.trim(),
          plz: plz.trim(),
          city: city.trim(),
          budget: budget ? parseFloat(budget) : undefined,
        })
        .then(async (res) => {
          const id = res.data.request?.id ?? (res.data as unknown as { id: string }).id
          if (publish) await requestsApi.publish(id)
          return res.data
        }),
    onSuccess: () => {
      setApiError(null)
      qc.invalidateQueries({ queryKey: ['my-requests'] })
      // Providers reach this screen from their own tabs (e.g. "+ Auftrag" in
      // der Jobbörse) via this shared modal route — sending them into the
      // customer tab group here would strand them there. Just dismiss back
      // to wherever they came from. Customers land on their requests list.
      if (user?.role === 'PROVIDER') {
        router.back()
      } else {
        router.replace('/(customer)/requests')
      }
    },
    onError: (err) => setApiError(getApiErrorMessage(err)),
  })

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!categoryId) errs.category = 'Bitte wähle eine Kategorie'
    if (!title.trim()) errs.title = 'Titel erforderlich'
    if (!description.trim() || description.trim().length < 20) errs.description = 'Beschreibung: mindestens 20 Zeichen'
    if (!plz.trim() || !/^\d{5}$/.test(plz.trim())) errs.plz = 'Gültige PLZ (5 Ziffern) erforderlich'
    if (!city.trim()) errs.city = 'Ort erforderlich'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Zurück</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Neuen Auftrag erstellen</Text>
          <Text style={styles.subtitle}>Beschreibe was du benötigst.</Text>

          {/* Category selector */}
          <Text style={styles.label}>Kategorie *</Text>
          {errors.category ? <Text style={styles.errorText}>{errors.category}</Text> : null}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.catScroll}
            contentContainerStyle={styles.catScrollContent}
          >
            {categories?.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setCategoryId(cat.id)}
                style={[styles.catChip, categoryId === cat.id ? styles.catChipActive : null]}
              >
                <Text style={styles.catChipIcon}>{cat.icon ?? '🔧'}</Text>
                <Text style={[styles.catChipLabel, categoryId === cat.id ? styles.catChipLabelActive : null]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Input
            label="Titel *"
            value={title}
            onChangeText={setTitle}
            placeholder="z.B. Wohnung reinigen, 80 m²"
            error={errors.title}
          />
          <Input
            label="Beschreibung *"
            value={description}
            onChangeText={setDescription}
            placeholder="Beschreibe die Aufgabe genau..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            style={styles.textArea}
            error={errors.description}
          />

          <View style={styles.row}>
            <Input
              label="PLZ *"
              value={plz}
              onChangeText={(v) => setPlz(formatPlzInput(v))}
              keyboardType="number-pad"
              placeholder="12345"
              maxLength={5}
              error={errors.plz}
              containerStyle={styles.plzInput}
            />
            <Input
              label="Ort *"
              value={city}
              onChangeText={setCity}
              placeholder="Berlin"
              error={errors.city}
              containerStyle={styles.cityInput}
            />
          </View>

          <Input
            label="Budget (optional)"
            value={budget}
            onChangeText={setBudget}
            keyboardType="decimal-pad"
            placeholder="z.B. 150"
            hint="In Euro. Leer lassen wenn offen."
            rightIcon={<Text style={styles.euroSign}>€</Text>}
          />

          {apiError ? <Text style={styles.apiError}>{apiError}</Text> : null}

          <View style={styles.actionRow}>
            <Button
              label="Als Entwurf speichern"
              variant="outline"
              onPress={() => validate() && mutation.mutate(false)}
              loading={mutation.isPending}
              fullWidth={false}
              style={styles.draftBtn}
            />
            <Button
              label="Veröffentlichen"
              onPress={() => validate() && mutation.mutate(true)}
              loading={mutation.isPending}
              fullWidth={false}
              style={styles.publishBtn}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  kav: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.lg },
  back: { marginBottom: spacing.lg },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.medium },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.lg },
  label: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text, marginBottom: spacing.xs },
  errorText: { fontSize: fontSize.sm, color: colors.error, marginBottom: spacing.xs },
  catScroll: { marginBottom: spacing.md },
  catScrollContent: { gap: spacing.sm, paddingBottom: spacing.xs },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  catChipIcon: { fontSize: 16 },
  catChipLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium },
  catChipLabelActive: { color: colors.primary },
  textArea: { height: 100, paddingTop: 14 },
  row: { flexDirection: 'row', gap: spacing.md },
  plzInput: { width: 110 },
  cityInput: { flex: 1 },
  euroSign: { fontSize: fontSize.md, color: colors.textSecondary },
  apiError: { fontSize: fontSize.sm, color: colors.error, backgroundColor: '#fee2e2', padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  draftBtn: { flex: 1 },
  publishBtn: { flex: 1 },
})
