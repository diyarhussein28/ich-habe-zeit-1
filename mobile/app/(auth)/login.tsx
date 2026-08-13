import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
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
import { useAuthStore } from '../../src/store/auth.store'
import {
  getApiErrorMessage,
  classifyNetworkFailure,
  runConnectionDiagnostic,
  type ConnectionDiagnostic,
} from '../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'

export default function LoginScreen() {
  const router = useRouter()
  const { login } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  // Shown only after a connection-level failure, so a tester can report what
  // actually went wrong instead of the opaque "Network Error".
  const [showDiagnostic, setShowDiagnostic] = useState(false)
  const [diagnostic, setDiagnostic] = useState<ConnectionDiagnostic | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)

  const validate = () => {
    const errs: typeof errors = {}
    if (!email.trim()) errs.email = 'E-Mail ist erforderlich'
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = 'Ungültige E-Mail-Adresse'
    if (!password) errs.password = 'Passwort ist erforderlich'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleLogin = async () => {
    if (!validate()) return
    setLoading(true)
    setShowDiagnostic(false)
    setDiagnostic(null)
    try {
      const res = await authApi.login({ email: email.trim().toLowerCase(), password })
      if ('deviceChallengeRequired' in res.data) {
        router.push({ pathname: '/(auth)/device-challenge', params: { challengeToken: res.data.challengeToken } })
        return
      }
      await login(res.data.token, res.data.user)
      // Root index.tsx will redirect based on role
      router.replace('/')
    } catch (err) {
      const kind = classifyNetworkFailure(err)
      if (kind === 'timeout' || kind === 'unreachable') setShowDiagnostic(true)
      Alert.alert('Anmeldung fehlgeschlagen', getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleDiagnose = async () => {
    setDiagnosing(true)
    try {
      setDiagnostic(await runConnectionDiagnostic())
    } finally {
      setDiagnosing(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Zurück</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Willkommen zurück</Text>
          <Text style={styles.subtitle}>Melde dich mit deiner E-Mail an.</Text>

          <View style={styles.form}>
            <Input
              label="E-Mail"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="name@beispiel.de"
              error={errors.email}
            />
            <Input
              label="Passwort"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="password"
              placeholder="••••••••"
              error={errors.password}
              rightIcon={
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
              }
              onRightIconPress={() => setShowPassword((v) => !v)}
            />

            <TouchableOpacity
              onPress={() => router.push('/(auth)/forgot-password')}
              style={styles.forgotLink}
            >
              <Text style={styles.forgotText}>Passwort vergessen?</Text>
            </TouchableOpacity>

            <Button label="Anmelden" onPress={handleLogin} loading={loading} />

            {showDiagnostic && (
              <View style={styles.diagnosticBox}>
                <Text style={styles.diagnosticTitle}>Verbindungsproblem</Text>
                <Text style={styles.diagnosticHint}>
                  Die App konnte den Server nicht erreichen. Führe den Verbindungstest aus, um die Ursache zu finden.
                </Text>
                <Button
                  label="Verbindung testen"
                  variant="outline"
                  onPress={handleDiagnose}
                  loading={diagnosing}
                />
                {diagnostic && (
                  <View style={styles.diagnosticResult}>
                    <Text style={[styles.diagnosticStatus, diagnostic.ok ? styles.diagnosticOk : styles.diagnosticFail]}>
                      {diagnostic.ok
                        ? `✓ Server erreichbar (${diagnostic.latencyMs} ms)`
                        : '✕ Server nicht erreichbar'}
                    </Text>
                    <Text style={styles.diagnosticDetail}>{diagnostic.detail}</Text>
                    <Text style={styles.diagnosticUrl} selectable>{diagnostic.apiUrl}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Noch kein Konto? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.footerLink}>Registrieren</Text>
            </TouchableOpacity>
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
  title: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.xl },
  form: { gap: 0 },
  forgotLink: { alignSelf: 'flex-end', marginBottom: spacing.lg, marginTop: -spacing.sm },
  forgotText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },
  eyeIcon: { fontSize: 18 },
  diagnosticBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    gap: spacing.sm,
  },
  diagnosticTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  diagnosticHint: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 19 },
  diagnosticResult: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  diagnosticStatus: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  diagnosticOk: { color: colors.secondary },
  diagnosticFail: { color: colors.error },
  diagnosticDetail: { fontSize: fontSize.sm, color: colors.text, lineHeight: 19 },
  diagnosticUrl: { fontSize: fontSize.xs, color: colors.textDisabled },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  footerText: { fontSize: fontSize.md, color: colors.textSecondary },
  footerLink: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.semibold },
})
