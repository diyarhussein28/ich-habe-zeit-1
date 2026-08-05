import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Switch, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { profileApi, type PricingModel } from '../../../src/api/profile.api'
import { PhotoGridPicker } from '../../../src/components/PhotoGridPicker'
import { Button } from '../../../src/components/ui/Button'
import { getApiErrorMessage } from '../../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'

const LANGUAGE_OPTIONS = ['Deutsch', 'Englisch', 'Türkisch', 'Arabisch', 'Russisch', 'Polnisch', 'Französisch', 'Spanisch', 'Italienisch']

const PRICING_OPTIONS: Array<{ value: PricingModel; label: string }> = [
  { value: 'FIXED_PRICE', label: 'Festpreis' },
  { value: 'PER_HOUR', label: 'Pro Stunde' },
  { value: 'CUSTOM_QUOTE', label: 'Individuelles Angebot' },
]

export default function EditProviderProfileScreen() {
  const router = useRouter()
  const qc = useQueryClient()
  const [bio, setBio] = useState('')
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [languages, setLanguages] = useState<string[]>([])
  const [pricingModel, setPricingModel] = useState<PricingModel>('FIXED_PRICE')
  const [isAvailable, setIsAvailable] = useState(true)
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['provider-profile'],
    queryFn: () => profileApi.getProviderProfile().then((r) => r.data.profile),
  })

  useEffect(() => {
    if (data) {
      setBio(data.bio ?? '')
      setPhotoUrls(data.servicePhotoUrls ?? [])
      setLanguages(data.languages ?? [])
      setPricingModel(data.pricingModel ?? 'FIXED_PRICE')
      setIsAvailable(data.isAvailable)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => profileApi.updateProviderProfile({
      bio: bio.trim(),
      servicePhotoUrls: photoUrls,
      languages,
      pricingModel,
      isAvailable,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-profile'] })
      qc.invalidateQueries({ queryKey: ['my-profile'] })
      Alert.alert('Gespeichert', 'Dein Profil wurde aktualisiert.')
      router.back()
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  function toggleLanguage(lang: string) {
    setLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]))
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profil bearbeiten</Text>
        <View style={{ width: 60 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Verfügbarkeit pausieren</Text>
                <Text style={styles.hint}>Wenn pausiert, erhältst du keine neuen Anfragen.</Text>
              </View>
              <Switch value={!isAvailable} onValueChange={(paused) => setIsAvailable(!paused)} trackColor={{ true: colors.warning }} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Über mich</Text>
            <TextInput
              style={styles.textArea}
              value={bio}
              onChangeText={setBio}
              placeholder="Erzähle Kunden etwas über dich und deine Erfahrung…"
              placeholderTextColor={colors.textDisabled}
              multiline
              numberOfLines={4}
              maxLength={2000}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Service-Fotos</Text>
            <PhotoGridPicker urls={photoUrls} onChange={setPhotoUrls} context="SERVICE_PHOTO" maxPhotos={10} />
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Sprachen</Text>
            <View style={styles.chipWrap}>
              {LANGUAGE_OPTIONS.map((lang) => {
                const selected = languages.includes(lang)
                return (
                  <TouchableOpacity key={lang} style={[styles.chip, selected && styles.chipActive]} onPress={() => toggleLanguage(lang)}>
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>{lang}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Preismodell</Text>
            <View style={styles.chipWrap}>
              {PRICING_OPTIONS.map((opt) => (
                <TouchableOpacity key={opt.value} style={[styles.chip, pricingModel === opt.value && styles.chipActive]} onPress={() => setPricingModel(opt.value)}>
                  <Text style={[styles.chipText, pricingModel === opt.value && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button label="Speichern" onPress={() => { setError(''); saveMutation.mutate() }} loading={saveMutation.isPending} style={{ marginTop: spacing.sm }} />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { fontSize: fontSize.sm, color: colors.primary },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  content: { padding: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fieldLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs },
  hint: { fontSize: fontSize.xs, color: colors.textDisabled, marginTop: 2 },
  textArea: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, fontSize: fontSize.sm, color: colors.text, minHeight: 90, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, color: colors.textSecondary },
  chipTextActive: { color: colors.textInverse, fontWeight: fontWeight.medium },
  errorText: { fontSize: fontSize.sm, color: colors.error, marginBottom: spacing.sm },
})
