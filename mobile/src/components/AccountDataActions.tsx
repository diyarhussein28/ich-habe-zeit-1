import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import * as SecureStore from 'expo-secure-store'
import { useRouter } from 'expo-router'
import { TOKEN_KEY } from '../api/client'
import { profileApi } from '../api/profile.api'
import { authApi } from '../api/auth.api'
import { useAuthStore } from '../store/auth.store'
import { ConfirmModal } from './ui/ConfirmModal'
import { getApiErrorMessage } from '../api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../constants/theme'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

export function AccountDataActions() {
  const router = useRouter()
  const { logout } = useAuthStore()
  const [downloading, setDownloading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY)
      if (!token) {
        Alert.alert('Fehler', 'Bitte melde dich erneut an.')
        return
      }

      const fileUri = `${FileSystem.cacheDirectory}meine-daten.json`
      const result = await FileSystem.downloadAsync(`${BASE_URL}/api/profile/export`, fileUri, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (result.status !== 200) throw new Error(`HTTP ${result.status}`)

      const canShare = await Sharing.isAvailableAsync()
      if (!canShare) {
        Alert.alert('Hinweis', `Datei gespeichert unter:\n${result.uri}`)
        return
      }
      await Sharing.shareAsync(result.uri, { mimeType: 'application/json', dialogTitle: 'Meine Daten' })
    } catch {
      Alert.alert('Fehler', 'Deine Daten konnten nicht heruntergeladen werden.')
    } finally {
      setDownloading(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await profileApi.deleteAccount()
      try { await authApi.logout() } catch {}
      await logout()
      router.replace('/(auth)/login')
    } catch (err) {
      setDeleting(false)
      setShowConfirm(false)
      Alert.alert('Löschen nicht möglich', getApiErrorMessage(err) || 'Dein Konto hat noch aktive Aufträge. Bitte schließe diese zuerst ab.')
    }
  }

  return (
    <View style={styles.panel}>
      <TouchableOpacity style={styles.row} onPress={handleDownload} disabled={downloading}>
        {downloading ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.rowLabel}>📥 Meine Daten herunterladen</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.row} onPress={() => setShowConfirm(true)} disabled={deleting}>
        {deleting ? <ActivityIndicator color={colors.error} /> : <Text style={[styles.rowLabel, styles.dangerLabel]}>🗑️ Konto löschen</Text>}
      </TouchableOpacity>

      <ConfirmModal
        visible={showConfirm}
        title="Konto wirklich löschen?"
        message="Diese Aktion kann nicht rückgängig gemacht werden. Deine persönlichen Daten werden entfernt; bereits abgeschlossene Aufträge und Rechnungen bleiben aus rechtlichen Gründen gespeichert."
        confirmLabel="Konto löschen"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { paddingVertical: spacing.sm },
  row: { paddingVertical: spacing.sm },
  rowLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text },
  dangerLabel: { color: colors.error },
})
