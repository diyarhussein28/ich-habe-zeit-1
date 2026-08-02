import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button } from '../../src/components/ui/Button'
import { Input } from '../../src/components/ui/Input'
import { authApi } from '../../src/api/auth.api'
import { getApiErrorMessage } from '../../src/api/client'
import { colors, spacing, fontSize, fontWeight } from '../../src/constants/theme'

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError('Bitte gib eine gültige E-Mail-Adresse ein.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await authApi.forgotPassword(email.trim().toLowerCase())
      setSent(true)
    } catch (err) {
      Alert.alert('Fehler', getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
        <View style={styles.container}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Zurück</Text>
          </TouchableOpacity>

          <Text style={styles.emoji}>{sent ? '✅' : '🔑'}</Text>

          {sent ? (
            <>
              <Text style={styles.title}>E-Mail gesendet</Text>
              <Text style={styles.subtitle}>
                Wir haben dir eine E-Mail mit einem Link zum Zurücksetzen deines Passworts an{' '}
                <Text style={styles.bold}>{email}</Text> gesendet.{'\n\n'}
                Bitte prüfe auch deinen Spam-Ordner.
              </Text>
              <Button label="Zurück zur Anmeldung" onPress={() => router.replace('/(auth)/login')} />
            </>
          ) : (
            <>
              <Text style={styles.title}>Passwort vergessen?</Text>
              <Text style={styles.subtitle}>
                Gib deine E-Mail-Adresse ein. Wir senden dir einen Link zum Zurücksetzen.
              </Text>
              <Input
                label="E-Mail"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholder="name@beispiel.de"
                error={error}
              />
              <Button label="Link senden" onPress={handleSubmit} loading={loading} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  kav: { flex: 1 },
  container: { flex: 1, padding: spacing.lg },
  back: { marginBottom: spacing.xl },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.medium },
  emoji: { fontSize: 56, textAlign: 'center', marginBottom: spacing.lg },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  bold: { fontWeight: fontWeight.semibold, color: colors.text },
})
