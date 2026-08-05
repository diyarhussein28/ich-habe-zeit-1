import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Switch } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { profileApi, type NotificationSettings } from '../../src/api/profile.api'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'

const ROWS: Array<{ key: keyof NotificationSettings; label: string; hint: string }> = [
  { key: 'pushEnabled', label: 'Push-Benachrichtigungen', hint: 'Allgemeine Push-Mitteilungen auf diesem Gerät' },
  { key: 'emailEnabled', label: 'E-Mail-Benachrichtigungen', hint: 'Wichtige Updates per E-Mail' },
  { key: 'smsEnabled', label: 'SMS-Benachrichtigungen', hint: 'Nur für kritische Ereignisse (Streitfälle, Kontosicherheit)' },
  { key: 'newOfferPush', label: 'Neue Angebote (Push)', hint: 'Wenn ein Anbieter ein Angebot abgibt' },
  { key: 'newOfferEmail', label: 'Neue Angebote (E-Mail)', hint: 'Wenn ein Anbieter ein Angebot abgibt' },
  { key: 'chatMessagePush', label: 'Chat-Nachrichten', hint: 'Push bei neuen Nachrichten im Auftrags-Chat' },
  { key: 'marketingEmail', label: 'Marketing & Angebote', hint: 'Gelegentliche News und Aktionen per E-Mail' },
]

export default function NotificationSettingsScreen() {
  const router = useRouter()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: () => profileApi.getNotificationSettings().then((r) => r.data.settings),
  })

  const updateMutation = useMutation({
    mutationFn: (patch: Partial<NotificationSettings>) => profileApi.updateNotificationSettings(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ['notification-settings'] })
      const previous = qc.getQueryData<NotificationSettings>(['notification-settings'])
      if (previous) qc.setQueryData(['notification-settings'], { ...previous, ...patch })
      return { previous }
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) qc.setQueryData(['notification-settings'], context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notification-settings'] }),
  })

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Benachrichtigungen</Text>
        <View style={{ width: 60 }} />
      </View>

      {isLoading || !data ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <View style={styles.content}>
          <View style={styles.card}>
            {ROWS.map((row, i) => (
              <View key={row.key}>
                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: spacing.md }}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    <Text style={styles.rowHint}>{row.hint}</Text>
                  </View>
                  <Switch
                    value={!!data[row.key]}
                    onValueChange={(value) => updateMutation.mutate({ [row.key]: value })}
                    trackColor={{ true: colors.primary }}
                  />
                </View>
                {i < ROWS.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        </View>
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
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  rowLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text },
  rowHint: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border },
})
