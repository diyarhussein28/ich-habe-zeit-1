import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { profileApi, type ServiceArea } from '../../../src/api/profile.api'
import { Button } from '../../../src/components/ui/Button'
import { getApiErrorMessage } from '../../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'

export default function ServiceAreasScreen() {
  const router = useRouter()
  const qc = useQueryClient()
  const [areas, setAreas] = useState<Array<{ homePlz: string; radiusKm: number }>>([])
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['provider-profile'],
    queryFn: () => profileApi.getProviderProfile().then((r) => r.data.profile),
  })

  useEffect(() => {
    if (data) {
      setAreas(
        data.serviceAreas.length > 0
          ? data.serviceAreas.map((a: ServiceArea) => ({ homePlz: a.homePlz, radiusKm: a.radiusKm }))
          : [{ homePlz: '', radiusKm: 25 }]
      )
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => {
      const valid = areas.filter((a) => /^\d{5}$/.test(a.homePlz))
      if (valid.length === 0) throw new Error('Bitte gib mindestens eine gültige PLZ ein.')
      return profileApi.setServiceAreas(valid)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-profile'] })
      Alert.alert('Gespeichert', 'Deine Servicegebiete wurden aktualisiert.')
      router.back()
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  function addArea() {
    setAreas((prev) => [...prev, { homePlz: '', radiusKm: 25 }])
  }

  function removeArea(index: number) {
    setAreas((prev) => prev.filter((_, i) => i !== index))
  }

  function updateArea(index: number, patch: Partial<{ homePlz: string; radiusKm: number }>) {
    setAreas((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)))
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Servicegebiete</Text>
        <View style={{ width: 60 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.hint}>
            Lege eine oder mehrere Heimat-PLZ mit Radius fest. Du erhältst Aufträge aus diesem Umkreis.
          </Text>

          {areas.map((area, i) => (
            <View key={i} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Gebiet {i + 1}</Text>
                {areas.length > 1 && (
                  <TouchableOpacity onPress={() => removeArea(i)}>
                    <Text style={styles.removeText}>Entfernen</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.fieldLabel}>Heimat-PLZ</Text>
              <TextInput
                style={styles.input}
                value={area.homePlz}
                onChangeText={(v) => updateArea(i, { homePlz: v.replace(/[^0-9]/g, '') })}
                placeholder="10115"
                keyboardType="number-pad"
                maxLength={5}
                placeholderTextColor={colors.textDisabled}
              />

              <Text style={styles.fieldLabel}>Radius</Text>
              <View style={styles.radiusChips}>
                {[5, 10, 25, 50, 100, 200].map((km) => (
                  <TouchableOpacity
                    key={km}
                    style={[styles.radiusChip, area.radiusKm === km && styles.radiusChipActive]}
                    onPress={() => updateArea(i, { radiusKm: km })}
                  >
                    <Text style={[styles.radiusChipText, area.radiusKm === km && styles.radiusChipTextActive]}>{km} km</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          <TouchableOpacity onPress={addArea} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ Weiteres Gebiet hinzufügen</Text>
          </TouchableOpacity>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button label="Speichern" onPress={() => { setError(''); saveMutation.mutate() }} loading={saveMutation.isPending} style={{ marginTop: spacing.lg }} />
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
  hint: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  cardTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text },
  removeText: { fontSize: fontSize.xs, color: colors.error },
  fieldLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.sm },
  radiusChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  radiusChip: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  radiusChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  radiusChipText: { fontSize: fontSize.xs, color: colors.textSecondary },
  radiusChipTextActive: { color: colors.textInverse, fontWeight: fontWeight.medium },
  addBtn: { paddingVertical: spacing.sm, alignItems: 'center' },
  addBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },
  errorText: { fontSize: fontSize.sm, color: colors.error, marginTop: spacing.sm },
})
