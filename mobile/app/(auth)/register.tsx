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
import { getApiErrorMessage } from '../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'
import type { UserRole } from '../../src/api/types'

type Role = Extract<UserRole, 'CUSTOMER' | 'PROVIDER'>

interface FormState {
  role: Role
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
  confirmPassword: string
}

export default function RegisterScreen() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>({
    role: 'CUSTOMER',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [apiError, setApiError] = useState('')

  const set = (key: keyof FormState) => (val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const validate = () => {
    const errs: typeof errors = {}
    if (!form.firstName.trim()) errs.firstName = 'Vorname erforderlich'
    if (!form.lastName.trim()) errs.lastName = 'Nachname erforderlich'
    if (!form.email.trim()) errs.email = 'E-Mail erforderlich'
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Ungültige E-Mail'
    if (!form.phone.trim()) errs.phone = 'Telefonnummer erforderlich'
    else if (!/^\+49[0-9]{10,11}$/.test(form.phone.replace(/\s/g, '')))
      errs.phone = 'Deutsche Nummer erforderlich (z.B. +4917612345678)'
    if (!form.password) errs.password = 'Passwort erforderlich'
    else if (form.password.length < 8) errs.password = 'Mindestens 8 Zeichen'
    if (form.password !== form.confirmPassword)
      errs.confirmPassword = 'Passwörter stimmen nicht überein'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleRegister = async () => {
    if (!validate()) return
    setApiError('')
    setLoading(true)
    try {
      await authApi.register({
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
        displayName: `${form.firstName.trim()} ${form.lastName.trim()}`,
        role: form.role,
      })
      router.push({
        pathname: '/(auth)/otp',
        params: { identifier: form.email.trim().toLowerCase(), type: 'email', purpose: 'register' },
      })
    } catch (err) {
      setApiError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Zurück</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Konto erstellen</Text>
          <Text style={styles.subtitle}>Wähle deine Rolle und fülle das Formular aus.</Text>

          {/* Role selector */}
          <View style={styles.roleRow}>
            {(['CUSTOMER', 'PROVIDER'] as Role[]).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.roleBtn, form.role === r ? styles.roleBtnActive : null]}
                onPress={() => setForm((prev) => ({ ...prev, role: r }))}
              >
                <Text style={styles.roleEmoji}>{r === 'CUSTOMER' ? '🙋' : '🔧'}</Text>
                <Text style={[styles.roleLabel, form.role === r ? styles.roleLabelActive : null]}>
                  {r === 'CUSTOMER' ? 'Auftraggeber' : 'Dienstleister'}
                </Text>
                <Text style={styles.roleDesc}>
                  {r === 'CUSTOMER' ? 'Aufgaben posten' : 'Jobs annehmen'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.nameRow}>
            <Input
              label="Vorname"
              value={form.firstName}
              onChangeText={set('firstName')}
              autoComplete="given-name"
              placeholder="Max"
              error={errors.firstName}
              containerStyle={styles.halfInput}
            />
            <Input
              label="Nachname"
              value={form.lastName}
              onChangeText={set('lastName')}
              autoComplete="family-name"
              placeholder="Mustermann"
              error={errors.lastName}
              containerStyle={styles.halfInput}
            />
          </View>

          <Input
            label="E-Mail"
            value={form.email}
            onChangeText={set('email')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="name@beispiel.de"
            error={errors.email}
          />
          <Input
            label="Telefonnummer"
            value={form.phone}
            onChangeText={set('phone')}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="+49 151 23456789"
            error={errors.phone}
            hint="Mit Ländervorwahl, z.B. +49"
          />
          <Input
            label="Passwort"
            value={form.password}
            onChangeText={set('password')}
            secureTextEntry={!showPassword}
            placeholder="Mindestens 8 Zeichen"
            error={errors.password}
            rightIcon={<Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>}
            onRightIconPress={() => setShowPassword((v) => !v)}
          />
          <Input
            label="Passwort bestätigen"
            value={form.confirmPassword}
            onChangeText={set('confirmPassword')}
            secureTextEntry={!showPassword}
            placeholder="Passwort wiederholen"
            error={errors.confirmPassword}
          />

          <Text style={styles.legal}>
            Mit der Registrierung akzeptierst du unsere{' '}
            <Text style={styles.legalLink}>AGB</Text> und{' '}
            <Text style={styles.legalLink}>Datenschutzrichtlinie</Text>.
          </Text>

          {apiError ? (
            <View style={styles.apiErrorBox}>
              <Text style={styles.apiErrorText}>{apiError}</Text>
            </View>
          ) : null}

          <Button label="Konto erstellen" onPress={handleRegister} loading={loading} />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Bereits ein Konto? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={styles.footerLink}>Anmelden</Text>
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
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.lg },
  roleRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  roleBtn: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  roleBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  roleEmoji: { fontSize: 32, marginBottom: spacing.xs },
  roleLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  roleLabelActive: { color: colors.primary },
  roleDesc: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  nameRow: { flexDirection: 'row', gap: spacing.sm },
  halfInput: { flex: 1 },
  eyeIcon: { fontSize: 18 },
  legal: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center', marginVertical: spacing.md, lineHeight: 18 },
  legalLink: { color: colors.primary, fontWeight: fontWeight.medium },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: spacing.lg },
  footerText: { fontSize: fontSize.md, color: colors.textSecondary },
  footerLink: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.semibold },
  apiErrorBox: { backgroundColor: '#FEE2E2', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  apiErrorText: { color: '#DC2626', fontSize: fontSize.sm, textAlign: 'center' },
})
