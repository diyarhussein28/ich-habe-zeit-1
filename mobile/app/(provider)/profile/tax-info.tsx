import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Switch, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { profileApi } from '../../../src/api/profile.api'
import { Button } from '../../../src/components/ui/Button'
import { getApiErrorMessage } from '../../../src/api/client'
import { formatEur } from '../../../src/utils/currency'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'

export default function TaxInfoScreen() {
  const router = useRouter()
  const qc = useQueryClient()
  const [isKleinunternehmer, setIsKleinunternehmer] = useState(true)
  const [legalName, setLegalName] = useState('')
  const [vatNumber, setVatNumber] = useState('')
  const [taxId, setTaxId] = useState('')
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['provider-profile'],
    queryFn: () => profileApi.getProviderProfile().then((r) => r.data.profile),
  })

  const { data: kuStatus } = useQuery({
    queryKey: ['kleinunternehmer-status'],
    queryFn: () => profileApi.getKleinunternehmerStatus().then((r) => r.data),
  })

  useEffect(() => {
    if (data) {
      setIsKleinunternehmer(data.isKleinunternehmer)
      setLegalName(data.legalName ?? '')
      setVatNumber(data.vatNumber ?? '')
      setTaxId(data.taxId ?? '')
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => profileApi.updateTaxInfo({
      isKleinunternehmer,
      legalName: legalName.trim(),
      vatNumber: vatNumber.trim() || undefined,
      taxId: taxId.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-profile'] })
      Alert.alert('Gespeichert', 'Deine Steuerangaben wurden aktualisiert.')
      router.back()
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Steuerangaben</Text>
        <View style={{ width: 60 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {kuStatus?.isKleinunternehmer && kuStatus.approachingThreshold && (
            <View style={[styles.warningCard, kuStatus.exceededThreshold && styles.dangerCard]}>
              <Text style={styles.warningTitle}>
                {kuStatus.exceededThreshold ? '⚠️ Kleinunternehmer-Grenze überschritten' : '⚠️ Kleinunternehmer-Grenze wird bald erreicht'}
              </Text>
              <Text style={styles.warningText}>
                Dein Umsatz dieses Jahr: {formatEur(kuStatus.revenueThisYear)} von {formatEur(kuStatus.threshold)}.
                {kuStatus.exceededThreshold
                  ? ' Bitte prüfe mit einem Steuerberater, ob du zur Regelbesteuerung wechseln musst.'
                  : ' Behalte deinen Umsatz im Blick.'}
              </Text>
            </View>
          )}

          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Kleinunternehmer (§ 19 UStG)</Text>
                <Text style={styles.hint}>Keine Umsatzsteuer auf deinen Rechnungen.</Text>
              </View>
              <Switch value={isKleinunternehmer} onValueChange={setIsKleinunternehmer} trackColor={{ true: colors.primary }} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Rechtlicher Name *</Text>
            <TextInput style={styles.input} value={legalName} onChangeText={setLegalName} placeholder="Vor- und Nachname oder Firmenname" placeholderTextColor={colors.textDisabled} />

            {!isKleinunternehmer && (
              <>
                <Text style={styles.fieldLabel}>USt-IdNr.</Text>
                <TextInput style={styles.input} value={vatNumber} onChangeText={setVatNumber} placeholder="DE123456789" placeholderTextColor={colors.textDisabled} autoCapitalize="characters" />
              </>
            )}

            <Text style={styles.fieldLabel}>Steuernummer (optional)</Text>
            <TextInput style={styles.input} value={taxId} onChangeText={setTaxId} placeholder="12/345/67890" placeholderTextColor={colors.textDisabled} />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            label="Speichern"
            onPress={() => {
              if (!legalName.trim()) { setError('Bitte gib deinen rechtlichen Namen ein.'); return }
              setError('')
              saveMutation.mutate()
            }}
            loading={saveMutation.isPending}
            style={{ marginTop: spacing.sm }}
          />
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
  warningCard: { backgroundColor: colors.warningLight, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  dangerCard: { backgroundColor: colors.errorLight, borderColor: colors.error },
  warningTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  warningText: { fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 18 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fieldLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs, marginTop: spacing.sm },
  hint: { fontSize: fontSize.xs, color: colors.textDisabled, marginTop: 2 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, fontSize: fontSize.sm, color: colors.text },
  errorText: { fontSize: fontSize.sm, color: colors.error, marginBottom: spacing.sm },
})
