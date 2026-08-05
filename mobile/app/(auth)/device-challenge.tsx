import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button } from '../../src/components/ui/Button'
import { Input } from '../../src/components/ui/Input'
import { authApi } from '../../src/api/auth.api'
import { useAuthStore } from '../../src/store/auth.store'
import { getApiErrorMessage } from '../../src/api/client'
import { colors, spacing, fontSize, fontWeight } from '../../src/constants/theme'

export default function DeviceChallengeScreen() {
  const router = useRouter()
  const { login } = useAuthStore()
  const { challengeToken } = useLocalSearchParams<{ challengeToken: string }>()
  const [code, setCode] = useState('')
  const [trustDevice, setTrustDevice] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    if (code.trim().length !== 6) {
      setError('Bitte gib den 6-stelligen Code ein.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await authApi.deviceChallenge({ challengeToken, code: code.trim(), trustDevice })
      await login(res.data.token, res.data.user)
      router.replace('/')
    } catch (err) {
      Alert.alert('Bestätigung fehlgeschlagen', getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
        <View style={styles.content}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Zurück</Text>
          </TouchableOpacity>

          <Text style={styles.emoji}>📱</Text>
          <Text style={styles.title}>Neues Gerät erkannt</Text>
          <Text style={styles.subtitle}>
            Wir haben dir einen Bestätigungscode per E-Mail geschickt, um diese Anmeldung zu bestätigen.
          </Text>

          <Input
            label="Bestätigungscode"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="123456"
            error={error}
          />

          <View style={styles.trustRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.trustLabel}>Dieses Gerät 30 Tage vertrauen</Text>
              <Text style={styles.trustHint}>Kein erneuter Code bei zukünftigen Anmeldungen von diesem Gerät.</Text>
            </View>
            <Switch value={trustDevice} onValueChange={setTrustDevice} trackColor={{ true: colors.primary }} />
          </View>

          <Button label="Bestätigen" onPress={handleConfirm} loading={loading} style={{ marginTop: spacing.md }} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  kav: { flex: 1 },
  content: { flex: 1, padding: spacing.lg },
  back: { marginBottom: spacing.xl },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.medium },
  emoji: { fontSize: 56, textAlign: 'center', marginBottom: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: 12 },
  trustLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text },
  trustHint: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
})
