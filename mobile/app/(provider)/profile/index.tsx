import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Linking, TextInput, Switch } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../../src/store/auth.store'
import { authApi } from '../../../src/api/auth.api'
import { apiClient, getApiErrorMessage } from '../../../src/api/client'
import { profileApi, type ProfileCategory } from '../../../src/api/profile.api'
import { categoriesApi } from '../../../src/api/categories.api'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { Button } from '../../../src/components/ui/Button'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'

const KYC_LABEL: Record<string, string> = {
  REGISTERED: 'Nicht verifiziert',
  PROFILE_COMPLETE: 'Profil vollständig',
  KYC_PENDING: 'KYC-Prüfung ausstehend',
  KYC_VERIFIED: '✓ Verifiziert',
  KYC_REJECTED: 'Abgelehnt',
  KYC_RESUBMISSION: 'Erneute Einreichung nötig',
  PAYOUT_RESTRICTED: 'Auszahlung eingeschränkt',
  SUSPENDED: 'Gesperrt',
}

export default function ProviderProfileScreen() {
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
  const [showCategoryEditor, setShowCategoryEditor] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [catSaveError, setCatSaveError] = useState<string | null>(null)

  const { data: profileData } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => profileApi.getMe().then((r) => r.data.profile),
    enabled: !!user,
  })

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

  const { data: myCategories } = useQuery({
    queryKey: ['provider-my-categories'],
    queryFn: () => profileApi.getProviderCategories().then((r) => r.data.categories),
    enabled: !!user,
  })

  const { data: allCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data.categories),
    enabled: showCategoryEditor,
  })

  const saveCategoriesMutation = useMutation({
    mutationFn: () => profileApi.setProviderCategories(selectedCategoryIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-my-categories'] })
      setShowCategoryEditor(false)
      setCatSaveError(null)
    },
    onError: (err) => setCatSaveError(getApiErrorMessage(err)),
  })

  const profile = profileData ?? user

  const { data: stripeStatus, refetch: refetchStripe } = useQuery({
    queryKey: ['stripe-connect-status'],
    queryFn: () => apiClient.get<{ connected: boolean; enabled: boolean }>('/api/stripe/connect/status').then((r) => r.data),
    enabled: !!user,
  })

  const handleConnectStripe = async () => {
    try {
      const { data } = await apiClient.post<{ url: string }>('/api/stripe/connect/onboard')
      await Linking.openURL(data.url)
      // Refetch status after returning to the app
      setTimeout(() => refetchStripe(), 2000)
    } catch {
      Alert.alert('Fehler', 'Stripe-Verbindung konnte nicht gestartet werden.')
    }
  }

  const handleLogout = async () => {
    Alert.alert('Abmelden', 'Möchtest du dich wirklich abmelden?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Abmelden',
        style: 'destructive',
        onPress: async () => {
          try { await authApi.logout() } catch {}
          await logout()
          router.replace('/(auth)/login')
        },
      },
    ])
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
            <TouchableOpacity onPress={() => { setDisplayName(profile.displayName); setSaveError(null); setEditing(true) }} style={styles.editBtn}>
              <Text style={styles.editBtnText}>✎ Bearbeiten</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{profile.displayName}</Text>
          <Text style={styles.role}>Dienstleister</Text>
          <Badge
            label={KYC_LABEL[profile.verificationStatus] ?? profile.verificationStatus}
            color={profile.verificationStatus === 'KYC_VERIFIED' ? 'success' : 'warning'}
            style={{ marginTop: spacing.sm }}
          />
        </View>

        {editing && (
          <Card style={styles.card}>
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
            {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
            <View style={styles.editActions}>
              <Button label="Abbrechen" variant="outline" fullWidth={false} style={styles.editActionBtn} onPress={() => { setEditing(false); setSaveError(null) }} />
              <Button label="Speichern" fullWidth={false} style={styles.editActionBtn} loading={saveMutation.isPending}
                onPress={() => { if (!displayName.trim()) { setSaveError('Name darf nicht leer sein.'); return } saveMutation.mutate() }} />
            </View>
          </Card>
        )}

        <Card style={styles.card}>
          <InfoRow label="E-Mail" value={profile.email} />
          <Divider />
          <InfoRow label="Telefon" value={(profile as { phone?: string }).phone ?? '—'} />
          {(myCategories?.length ?? 0) > 0 && (
            <>
              <Divider />
              <View style={{ paddingVertical: spacing.sm }}>
                <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: spacing.xs }}>Kategorien</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  {myCategories!.map((c) => (
                    <View key={c.id} style={styles.catChip}>
                      <Text style={styles.catChipText}>{c.icon ?? '🔧'} {c.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}
        </Card>

        {profile.verificationStatus !== 'KYC_VERIFIED' && (
          <Card style={[styles.card, styles.kycCard]}>
            <Text style={styles.kycTitle}>🔒 KYC-Verifizierung erforderlich</Text>
            <Text style={styles.kycText}>
              Um Zahlungen zu empfangen, musst du deine Identität verifizieren.
            </Text>
            <Button label="Jetzt verifizieren" onPress={() => router.push('./kyc')} size="sm" style={{ marginTop: spacing.md }} />
          </Card>
        )}

        {/* Stripe Connect card */}
        {stripeStatus && !stripeStatus.enabled && (
          <Card style={[styles.card, styles.stripeCard]}>
            <Text style={styles.stripeTitle}>💳 Zahlungen empfangen</Text>
            <Text style={styles.stripeText}>
              Verbinde dein Bankkonto mit Stripe, um Auszahlungen zu erhalten.
            </Text>
            <Button
              label={stripeStatus.connected ? 'Onboarding fortsetzen' : 'Bankkonto verbinden'}
              onPress={handleConnectStripe}
              size="sm"
              style={{ marginTop: spacing.md }}
            />
          </Card>
        )}

        {stripeStatus?.enabled && (
          <Card style={[styles.card, styles.stripeReadyCard]}>
            <Text style={styles.stripeReadyText}>✓ Stripe verbunden — Auszahlungen aktiv</Text>
          </Card>
        )}

        <Card style={styles.card}>
          <MenuItem emoji="🏠" label="Servicegebiete" onPress={() => {}} />
          <Divider />
          <MenuItem emoji="📋" label="Kategorien" onPress={() => {
            setSelectedCategoryIds((myCategories ?? []).map((c) => c.id))
            setCatSaveError(null)
            setShowCategoryEditor((v) => !v)
          }} />
          {showCategoryEditor && (
            <View style={styles.notifPanel}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm }}>
                Wähle deine Dienstleistungskategorien:
              </Text>
              {(allCategories ?? []).map((cat) => {
                const selected = selectedCategoryIds.includes(cat.id)
                return (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setSelectedCategoryIds((prev) =>
                      selected ? prev.filter((id) => id !== cat.id) : [...prev, cat.id]
                    )}
                    style={styles.catRow}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.catRowIcon}>{cat.icon ?? '🔧'}</Text>
                    <Text style={[styles.catRowLabel, selected && styles.catRowLabelSelected]}>{cat.name}</Text>
                    <Text style={{ color: selected ? colors.primary : colors.border, fontSize: 18 }}>
                      {selected ? '✓' : '○'}
                    </Text>
                  </TouchableOpacity>
                )
              })}
              {catSaveError ? <Text style={styles.errorText}>{catSaveError}</Text> : null}
              <Button
                label="Speichern"
                loading={saveCategoriesMutation.isPending}
                onPress={() => saveCategoriesMutation.mutate()}
                style={{ marginTop: spacing.sm }}
              />
            </View>
          )}
          <Divider />
          <MenuItem emoji="📄" label="Rechnungen" onPress={() => router.push('./invoices')} />
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

        <Button label="Abmelden" variant="danger" onPress={handleLogout} style={styles.logoutBtn} />
        <Text style={styles.version}>Ich habe Zeit · Version 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
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
  editCardTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.md },
  fieldLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs },
  textInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.background, marginBottom: spacing.md },
  editActions: { flexDirection: 'row', gap: spacing.md },
  editActionBtn: { flex: 1 },
  errorText: { fontSize: fontSize.sm, color: colors.error, backgroundColor: '#fee2e2', padding: spacing.sm, borderRadius: 6, marginBottom: spacing.sm },
  avatarSection: { alignItems: 'center', marginBottom: spacing.xl },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  avatarText: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.textInverse },
  name: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  role: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  card: { marginBottom: spacing.md },
  kycCard: { backgroundColor: colors.warningLight, borderColor: colors.warning },
  kycTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  kycText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  stripeCard: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  stripeTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  stripeText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  stripeReadyCard: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  stripeReadyText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: '#16A34A' },
  notifPanel: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, marginVertical: spacing.xs, gap: spacing.sm },
  notifRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notifLabel: { fontSize: fontSize.sm, color: colors.text },
  catChip: { backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  catChipText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.medium },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm },
  catRowIcon: { fontSize: 18 },
  catRowLabel: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary },
  catRowLabelSelected: { color: colors.text, fontWeight: fontWeight.semibold },
  logoutBtn: { marginBottom: spacing.lg },
  version: { fontSize: fontSize.xs, color: colors.textDisabled, textAlign: 'center', marginBottom: spacing.xl },
})
