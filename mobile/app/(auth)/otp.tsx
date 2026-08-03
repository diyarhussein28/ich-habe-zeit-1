import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button } from '../../src/components/ui/Button'
import { authApi } from '../../src/api/auth.api'
import { useAuthStore } from '../../src/store/auth.store'
import { getApiErrorMessage } from '../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'

const CODE_LENGTH = 6

export default function OtpScreen() {
  const router = useRouter()
  const { login } = useAuthStore()
  const params = useLocalSearchParams<{
    identifier: string
    type: 'email' | 'phone'
    purpose: 'register' | 'login'
  }>()

  const identifier = params.identifier ?? ''
  const type = params.type ?? 'email'

  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(60)
  const inputRefs = useRef<(TextInput | null)[]>([])

  useEffect(() => {
    if (resendCountdown <= 0) return
    const timer = setInterval(() => setResendCountdown((v) => v - 1), 1000)
    return () => clearInterval(timer)
  }, [resendCountdown])

  const handleDigit = (val: string, index: number) => {
    const digit = val.replace(/\D/, '').slice(-1)
    const newCode = [...code]
    newCode[index] = digit
    setCode(newCode)
    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
    if (newCode.every((d) => d) && digit) {
      handleVerify(newCode.join(''))
    }
  }

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleVerify = async (fullCode?: string) => {
    const otp = fullCode ?? code.join('')
    if (otp.length < CODE_LENGTH) {
      Alert.alert('Fehler', 'Bitte gib den vollständigen Code ein.')
      return
    }
    setLoading(true)
    try {
      if (type === 'email') {
        await authApi.verifyEmail({ code: otp, identifier, type: 'email' })
        // Proceed to phone OTP (phone is in the user object from registration)
        router.replace({
          pathname: '/(auth)/otp',
          params: { identifier, type: 'phone', purpose: 'register' },
        })
      } else {
        const res = await authApi.verifyPhone({ code: otp, identifier, type: 'phone' })
        await login(res.data.token, res.data.user)
        router.replace('/')
      }
    } catch (err) {
      Alert.alert('Ungültiger Code', getApiErrorMessage(err))
      setCode(Array(CODE_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    try {
      await authApi.resendOtp({ identifier, type })
      setResendCountdown(60)
      setCode(Array(CODE_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } catch (err) {
      Alert.alert('Fehler', getApiErrorMessage(err))
    }
  }

  const isEmail = type === 'email'
  const maskedIdentifier = isEmail
    ? identifier.replace(/(.{2}).+(@.+)/, '$1***$2')
    : identifier.replace(/(.{3}).+(.{2})$/, '$1****$2')

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
        <View style={styles.container}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Zurück</Text>
          </TouchableOpacity>

          <Text style={styles.emoji}>{isEmail ? '📧' : '📱'}</Text>
          <Text style={styles.title}>
            {isEmail ? 'E-Mail bestätigen' : 'Telefon bestätigen'}
          </Text>
          <Text style={styles.subtitle}>
            Wir haben einen 6-stelligen Code an{'\n'}
            <Text style={styles.identifier}>{maskedIdentifier}</Text>
            {'\n'}gesendet.
          </Text>

          {/* OTP Input boxes */}
          <View style={styles.codeRow}>
            {code.map((digit, i) => (
              <TextInput
                key={i}
                ref={(ref) => { inputRefs.current[i] = ref }}
                style={[styles.codeInput, digit ? styles.codeInputFilled : null]}
                value={digit}
                onChangeText={(val) => handleDigit(val, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                keyboardType="number-pad"
                maxLength={1}
                textAlign="center"
                selectTextOnFocus
              />
            ))}
          </View>

          <Button
            label="Bestätigen"
            onPress={() => handleVerify()}
            loading={loading}
            disabled={code.filter(Boolean).length < CODE_LENGTH}
            style={styles.confirmBtn}
          />

          <View style={styles.resendRow}>
            {resendCountdown > 0 ? (
              <Text style={styles.resendTimer}>
                Code erneut senden in {resendCountdown}s
              </Text>
            ) : (
              <TouchableOpacity onPress={handleResend}>
                <Text style={styles.resendLink}>Code erneut senden</Text>
              </TouchableOpacity>
            )}
          </View>
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
  identifier: { fontWeight: fontWeight.semibold, color: colors.text },
  codeRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  codeInput: {
    width: 46,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  codeInputFilled: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  confirmBtn: { marginBottom: spacing.lg },
  resendRow: { alignItems: 'center' },
  resendTimer: { fontSize: fontSize.sm, color: colors.textSecondary },
  resendLink: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold },
})
