import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button } from '../../src/components/ui/Button'
import { Input } from '../../src/components/ui/Input'
import { authApi } from '../../src/api/auth.api'
import { getApiErrorMessage } from '../../src/api/client'
import { colors, spacing, fontSize, fontWeight } from '../../src/constants/theme'

export default function ResetPasswordScreen() {
  const router = useRouter()
  const { token } = useLocalSearchParams<{ token?: string }>()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!token) {
      setError('Ungültiger oder abgelaufener Link.')
      return
    }
    if (newPassword.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await authApi.resetPassword({ token, newPassword })
      setDone(true)
    } catch (err) {
      Alert.alert('Fehler', getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {!done && (
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.back}>
              <Text style={styles.backText}>← Zur Anmeldung</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.emoji}>{done ? '✅' : '🔑'}</Text>

          {done ? (
            <>
              <Text style={styles.title}>Passwort geändert</Text>
              <Text style={styles.subtitle}>Du kannst dich jetzt mit deinem neuen Passwort anmelden.</Text>
              <Button label="Zur Anmeldung" onPress={() => router.replace('/(auth)/login')} />
            </>
          ) : !token ? (
            <>
              <Text style={styles.title}>Link ungültig</Text>
              <Text style={styles.subtitle}>Dieser Link ist ungültig oder abgelaufen. Fordere einen neuen Link an.</Text>
              <Button label="Neuen Link anfordern" onPress={() => router.replace('/(auth)/forgot-password')} />
            </>
          ) : (
            <>
              <Text style={styles.title}>Neues Passwort festlegen</Text>
              <Text style={styles.subtitle}>Der Link ist einmalig gültig und läuft nach 1 Stunde ab.</Text>

              <Input
                label="Neues Passwort"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="Mindestens 8 Zeichen"
              />
              <Input
                label="Passwort bestätigen"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="Passwort wiederholen"
                error={error}
              />

              <Button label="Passwort speichern" onPress={handleSubmit} loading={loading} style={{ marginTop: spacing.sm }} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  kav: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center' },
  back: { position: 'absolute', top: spacing.lg, left: spacing.lg },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.medium },
  emoji: { fontSize: 56, textAlign: 'center', marginBottom: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl },
})
