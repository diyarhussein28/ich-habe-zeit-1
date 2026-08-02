import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '../../../src/store/auth.store'
import { authApi } from '../../../src/api/auth.api'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { Button } from '../../../src/components/ui/Button'
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
  const { user, logout } = useAuthStore()

  const handleLogout = async () => {
    Alert.alert('Abmelden', 'Möchtest du dich wirklich abmelden?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Abmelden',
        style: 'destructive',
        onPress: async () => {
          try {
            await authApi.logout()
          } catch {}
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

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{user.firstName} {user.lastName}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <Badge
            label={KYC_LABEL[user.verificationStatus] ?? user.verificationStatus}
            color={user.verificationStatus === 'KYC_VERIFIED' ? 'success' : 'warning'}
            style={{ marginTop: spacing.sm }}
          />
        </View>

        {/* Info Card */}
        <Card style={styles.infoCard}>
          <Row label="E-Mail" value={user.email} />
          <Divider />
          <Row label="Telefon" value={user.phone} />
          <Divider />
          <Row label="Rolle" value="Auftraggeber" />
        </Card>

        {/* Menu */}
        <Card style={styles.menuCard}>
          <MenuItem emoji="🔒" label="Passwort ändern" onPress={() => router.push('/(auth)/forgot-password')} />
          <Divider />
          <MenuItem emoji="🔔" label="Benachrichtigungen" onPress={() => {}} />
          <Divider />
          <MenuItem emoji="📄" label="AGB & Datenschutz" onPress={() => {}} />
          <Divider />
          <MenuItem emoji="❓" label="Hilfe & Support" onPress={() => {}} />
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
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.lg },
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
  infoCard: { marginBottom: spacing.md },
  menuCard: { marginBottom: spacing.lg },
  logoutBtn: { marginBottom: spacing.lg },
  version: { fontSize: fontSize.xs, color: colors.textDisabled, textAlign: 'center', marginBottom: spacing.xl },
})
