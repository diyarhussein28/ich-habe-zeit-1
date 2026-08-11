import React, { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../src/components/ui/Button'
import { profileApi } from '../src/api/profile.api'
import { getApiErrorMessage } from '../src/api/client'
import { useAuthStore } from '../src/store/auth.store'
import { colors, spacing, fontSize, fontWeight, radius } from '../src/constants/theme'

const BENEFITS = [
  { emoji: '🔍', text: 'Erscheine in der Jobbörse und erhalte Anfragen von Auftraggebern in deiner Nähe' },
  { emoji: '📝', text: 'Biete eigene Inserate an oder mache Angebote auf offene Aufträge' },
  { emoji: '💶', text: 'Werde per Stripe ausgezahlt, sobald ein Auftrag abgeschlossen ist' },
  { emoji: '🪪', text: 'Für Auszahlungen ist eine kurze Identitätsprüfung (KYC) nötig' },
]

export default function BecomeProviderScreen() {
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const [apiError, setApiError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => profileApi.becomeProvider().then((r) => r.data),
    onSuccess: async ({ token, user }) => {
      setApiError(null)
      await login(token, user)
      router.replace('/(provider)/profile/edit')
    },
    onError: (err) => setApiError(getApiErrorMessage(err)),
  })

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Zurück</Text>
        </TouchableOpacity>

        <Text style={styles.emoji}>🔧</Text>
        <Text style={styles.title}>Werde Dienstleister</Text>
        <Text style={styles.subtitle}>
          Du bleibst weiterhin Auftraggeber und kannst zusätzlich Dienstleistungen anbieten.
        </Text>

        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <View key={b.text} style={styles.benefitRow}>
              <Text style={styles.benefitEmoji}>{b.emoji}</Text>
              <Text style={styles.benefitText}>{b.text}</Text>
            </View>
          ))}
        </View>

        {apiError ? <Text style={styles.apiError}>{apiError}</Text> : null}

        <Button
          label="Jetzt Dienstleister werden"
          onPress={() => mutation.mutate()}
          loading={mutation.isPending}
        />
        <Text style={styles.hint}>
          Im nächsten Schritt richtest du dein Dienstleister-Profil ein (Kategorien, Servicegebiet, Verfügbarkeit).
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.lg },
  back: { marginBottom: spacing.lg },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.medium },
  emoji: { fontSize: 48, marginBottom: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 22 },
  benefits: { gap: spacing.md, marginBottom: spacing.lg },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  benefitEmoji: { fontSize: 20 },
  benefitText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  apiError: {
    fontSize: fontSize.sm,
    color: colors.error,
    backgroundColor: '#fee2e2',
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  hint: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
})
