import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Switch, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { profileApi } from '../../../src/api/profile.api'
import { Button } from '../../../src/components/ui/Button'
import { getApiErrorMessage } from '../../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'

const DAYS: Array<{ key: string; label: string }> = [
  { key: 'mon', label: 'Montag' },
  { key: 'tue', label: 'Dienstag' },
  { key: 'wed', label: 'Mittwoch' },
  { key: 'thu', label: 'Donnerstag' },
  { key: 'fri', label: 'Freitag' },
  { key: 'sat', label: 'Samstag' },
  { key: 'sun', label: 'Sonntag' },
]

type DaySchedule = { open: string; close: string; closed?: boolean }

const DEFAULT_SCHEDULE: DaySchedule = { open: '09:00', close: '18:00', closed: false }

export default function WorkingHoursScreen() {
  const router = useRouter()
  const qc = useQueryClient()
  const [schedule, setSchedule] = useState<Record<string, DaySchedule>>({})
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['provider-profile'],
    queryFn: () => profileApi.getProviderProfile().then((r) => r.data.profile),
  })

  useEffect(() => {
    if (data) {
      const existing = (data.workingHours ?? {}) as Record<string, DaySchedule>
      const next: Record<string, DaySchedule> = {}
      for (const day of DAYS) {
        next[day.key] = existing[day.key] ?? { ...DEFAULT_SCHEDULE, closed: day.key === 'sun' }
      }
      setSchedule(next)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => profileApi.updateProviderProfile({ workingHours: schedule }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-profile'] })
      Alert.alert('Gespeichert', 'Deine Arbeitszeiten wurden aktualisiert.')
      router.back()
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  function updateDay(key: string, patch: Partial<DaySchedule>) {
    setSchedule((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Arbeitszeiten</Text>
        <View style={{ width: 60 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {DAYS.map((day) => {
            const s = schedule[day.key] ?? DEFAULT_SCHEDULE
            return (
              <View key={day.key} style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.dayLabel}>{day.label}</Text>
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>{s.closed ? 'Geschlossen' : 'Geöffnet'}</Text>
                    <Switch value={!s.closed} onValueChange={(v) => updateDay(day.key, { closed: !v })} trackColor={{ true: colors.primary }} />
                  </View>
                </View>
                {!s.closed && (
                  <View style={styles.timeRow}>
                    <TextInput style={styles.timeInput} value={s.open} onChangeText={(v) => updateDay(day.key, { open: v })} placeholder="09:00" placeholderTextColor={colors.textDisabled} />
                    <Text style={styles.timeSep}>–</Text>
                    <TextInput style={styles.timeInput} value={s.close} onChangeText={(v) => updateDay(day.key, { close: v })} placeholder="18:00" placeholderTextColor={colors.textDisabled} />
                  </View>
                )}
              </View>
            )
          })}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button label="Speichern" onPress={() => { setError(''); saveMutation.mutate() }} loading={saveMutation.isPending} style={{ marginTop: spacing.md }} />
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
  row: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  toggleLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  timeInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, fontSize: fontSize.sm, color: colors.text, textAlign: 'center' },
  timeSep: { color: colors.textSecondary },
  errorText: { fontSize: fontSize.sm, color: colors.error, marginTop: spacing.sm },
})
