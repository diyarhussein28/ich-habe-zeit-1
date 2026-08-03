import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Switch,
  Linking,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../../src/store/auth.store'
import { authApi } from '../../../src/api/auth.api'
import { profileApi } from '../../../src/api/profile.api'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { Button } from '../../../src/components/ui/Button'
import { getApiErrorMessage } from '../../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'

const KYC_LABEL: Record<string, string> = {
  REGISTERED: 'Nicht verifiziert',
  PROFILE_COMPLETE: 'Profil vollständig',
  KYC_PENDING: 'Prüfung ausstehend',
  KYC_VERIFIED: 'Verifiziert',
  KYC_REJECTED: 'Abgelehnt',
  KYC_RESUBMISSION: 'Erneute Einreichung',
  PAYOUT_RESTRICTED: 'Auszahlung eingeschränkt',
  SUSPENDED: 'Gesperrt',
}

export default function CustomerProfileScreen() {
  const router = useRouter()
  const qc = useQueryClient()
  const { user, updateUser, logout } = useAuthStore()

  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showNotifications, setShowNotifications] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(true)
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [showAgb, setShowAgb] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => profileApi.getMe().then((r) => r.data.profile),
    enabled: !!user,
  })

  const profile = data ?? user

  const saveMutation = useMutation({
    mutationFn: () => profileApi.update({ displayName: displayName.trim() }),
    onSuccess: (res) => {
      updateUser({ displayName: res.data.profile.displayName })
      qc.invalidateQueries({ queryKey: ['my-profile'] })
      setEditing(false)
      setSaveError(null)
    },
    onError: (err) => setSaveError(getApiErrorMessage(err)),
  })

  const handleLogout = async () => {
    try { await authApi.logout() } catch {}
    await logout()
    router.replace('/(auth)/login')
  }

  const startEdit = () => {
    setDisplayName(profile?.displayName ?? '')
    setSaveError(null)
    setEditing(true)
  }

  if (!profile) return null

  const initials = profile.displayName
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Profil</Text>
          {!editing && (
            <TouchableOpacity onPress={startEdit} style={styles.editBtn}>
              <Text style={styles.editBtnText}>✎ Bearbeiten</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginBottom: spacing.md }} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          <Text style={styles.name}>{profile.displayName}</Text>
          <Text style={styles.email}>{profile.email}</Text>
          <Badge
            label={KYC_LABEL[profile.verificationStatus] ?? profile.verificationStatus}
            color={profile.verificationStatus === 'KYC_VERIFIED' ? 'success' : 'warning'}
            style={{ marginTop: spacing.sm }}
          />
        </View>

        {/* Edit form */}
        {editing && (
          <Card style={styles.editCard}>
            <Text style={styles.editCardTitle}>Profil bearbeiten</Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.textInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Dein Name"
              placeholderTextColor={colors.textDisabled}
              autoFocus
            />

            {saveError ? (
              <Text style={styles.errorText}>{saveError}</Text>
            ) : null}

            <View style={styles.editActions}>
              <Button
                label="Abbrechen"
                variant="outline"
                fullWidth={false}
                style={styles.editActionBtn}
                onPress={() => { setEditing(false); setSaveError(null) }}
              />
              <Button
                label="Speichern"
                fullWidth={false}
                style={styles.editActionBtn}
                loading={saveMutation.isPending}
                onPress={() => {
                  if (!displayName.trim()) {
                    setSaveError('Name darf nicht leer sein.')
                    return
                  }
                  saveMutation.mutate()
                }}
              />
            </View>
          </Card>
        )}

        {/* Info Card */}
        <Card style={styles.infoCard}>
          <Row label="E-Mail" value={profile.email} />
          <Divider />
          <Row label="Telefon" value={(profile as { phone?: string }).phone ?? '—'} />
          <Divider />
          <Row label="Rolle" value="Auftraggeber" />
        </Card>

        {/* Menu */}
        <Card style={styles.menuCard}>
          <MenuItem emoji="🔒" label="Passwort ändern" onPress={() => router.push('/(auth)/forgot-password')} />
          <Divider />
          <MenuItem emoji="🔔" label="Benachrichtigungen" onPress={() => setShowNotifications((v) => !v)} />
          {showNotifications && (
            <View style={styles.notifPanel}>
              <View style={styles.notifRow}>
                <Text style={styles.notifLabel}>Push-Benachrichtigungen</Text>
                <Switch value={pushEnabled} onValueChange={setPushEnabled} trackColor={{ true: colors.primary }} />
              </View>
              <View style={styles.notifRow}>
                <Text style={styles.notifLabel}>E-Mail-Benachrichtigungen</Text>
                <Switch value={emailEnabled} onValueChange={setEmailEnabled} trackColor={{ true: colors.primary }} />
              </View>
            </View>
          )}
          <Divider />
          <MenuItem emoji="📄" label="AGB & Datenschutz" onPress={() => setShowAgb((v) => !v)} />
          {showAgb && (
            <View style={styles.notifPanel}>
              <Text style={styles.notifLabel}>AGB & Datenschutz werden in Kürze verfügbar sein.</Text>
            </View>
          )}
          <Divider />
          <MenuItem emoji="❓" label="Hilfe & Support" onPress={() => Linking.openURL('mailto:support@ich-habe-zeit.de')} />
        </Card>

        <Button
          label="Abmelden"
          variant="danger"
          onPress={handleLogout}
          style={styles.logoutBtn}
        />

        <Text style={styles.version}>Ich habe Zeit · Version 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  )
}

function MenuItem({ emoji, label, onPress }: { emoji: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={rowStyles.menuItem}>
      <Text style={rowStyles.menuEmoji}>{emoji}</Text>
      <Text style={rowStyles.menuLabel}>{label}</Text>
      <Text style={rowStyles.menuArrow}>›</Text>
    </TouchableOpacity>
  )
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  label: { fontSize: fontSize.sm, color: colors.textSecondary },
  value: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: spacing.md },
  menuEmoji: { fontSize: 20 },
  menuLabel: { flex: 1, fontSize: fontSize.md, color: colors.text },
  menuArrow: { fontSize: 20, color: colors.textSecondary },
})

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  editBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1, borderColor: colors.primary },
  editBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },
  avatarSection: { alignItems: 'center', marginBottom: spacing.xl },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.textInverse },
  name: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  email: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  editCard: { marginBottom: spacing.md },
  editCardTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.md },
  fieldLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs },
  textInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.background,
    marginBottom: spacing.md,
  },
  editActions: { flexDirection: 'row', gap: spacing.md },
  editActionBtn: { flex: 1 },
  errorText: { fontSize: fontSize.sm, color: colors.error, backgroundColor: '#fee2e2', padding: spacing.sm, borderRadius: 6, marginBottom: spacing.sm },
  infoCard: { marginBottom: spacing.md },
  menuCard: { marginBottom: spacing.lg },
  notifPanel: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, marginVertical: spacing.xs, gap: spacing.sm },
  notifRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notifLabel: { fontSize: fontSize.sm, color: colors.text },
  logoutBtn: { marginBottom: spacing.lg },
  version: { fontSize: fontSize.xs, color: colors.textDisabled, textAlign: 'center', marginBottom: spacing.xl },
})
