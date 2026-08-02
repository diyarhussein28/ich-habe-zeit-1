import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../../src/store/auth.store'
import { authApi } from '../../../src/api/auth.api'
import { apiClient } from '../../../src/api/client'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { Button } from '../../../src/components/ui/Button'
import { colors, spacing, fontSize, fontWeight } from '../../../src/constants/theme'

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
  const { user, logout } = useAuthStore()

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

  if (!user) return null
  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Profil</Text>

        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{user.firstName} {user.lastName}</Text>
          <Text style={styles.role}>Dienstleister</Text>
          <Badge
            label={KYC_LABEL[user.verificationStatus] ?? user.verificationStatus}
            color={user.verificationStatus === 'KYC_VERIFIED' ? 'success' : 'warning'}
            style={{ marginTop: spacing.sm }}
          />
        </View>

        <Card style={styles.card}>
          <InfoRow label="E-Mail" value={user.email} />
          <Divider />
          <InfoRow label="Telefon" value={user.phone} />
        </Card>

        {user.verificationStatus !== 'KYC_VERIFIED' && (
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
          <MenuItem emoji="📋" label="Kategorien" onPress={() => {}} />
          <Divider />
          <MenuItem emoji="📄" label="Rechnungen" onPress={() => router.push('./invoices')} />
          <Divider />
          <MenuItem emoji="❓" label="Hilfe & Support" onPress={() => {}} />
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
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.lg },
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
  logoutBtn: { marginBottom: spacing.lg },
  version: { fontSize: fontSize.xs, color: colors.textDisabled, textAlign: 'center', marginBottom: spacing.xl },
})
