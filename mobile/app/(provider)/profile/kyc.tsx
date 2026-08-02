import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ScrollView, Image, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { kycApi, type KycDocumentType } from '../../../src/api/kyc.api'
import { useAuthStore } from '../../../src/store/auth.store'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'
import { getApiErrorMessage } from '../../../src/api/client'

interface DocSlot {
  type: KycDocumentType
  emoji: string
  title: string
  desc: string
}

const SLOTS: DocSlot[] = [
  { type: 'ID_FRONT',       emoji: '🪪', title: 'Ausweis Vorderseite',  desc: 'Vorderseite deines Personalausweises oder Reisepasses' },
  { type: 'ID_BACK',        emoji: '↩️', title: 'Ausweis Rückseite',    desc: 'Rückseite deines Personalausweises (bei Reisepass entfällt dies)' },
  { type: 'SELFIE_WITH_ID', emoji: '🤳', title: 'Selfie mit Ausweis',   desc: 'Halte deinen aufgeschlagenen Ausweis neben dein Gesicht' },
]

interface PickedImage {
  uri: string
  mimeType: string
}

export default function KycScreen() {
  const router = useRouter()
  const { user, updateUser } = useAuthStore()
  const qc = useQueryClient()
  const [images, setImages] = useState<Partial<Record<KycDocumentType, PickedImage>>>({})
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const isPending = user?.verificationStatus === 'KYC_PENDING'
  const isRejected = user?.verificationStatus === 'KYC_REJECTED'
  const isResubmission = user?.verificationStatus === 'KYC_RESUBMISSION'

  const allSelected = SLOTS.every((s) => !!images[s.type])

  async function pickImage(type: KycDocumentType, source: 'camera' | 'library') {
    let result: ImagePicker.ImagePickerResult

    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (perm.status !== 'granted') {
        Alert.alert('Kamerazugriff benötigt', 'Bitte erlaube den Kamerazugriff in den Einstellungen.')
        return
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [4, 3],
      })
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (perm.status !== 'granted') {
        Alert.alert('Galerie-Zugriff benötigt', 'Bitte erlaube den Zugriff auf die Galerie in den Einstellungen.')
        return
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [4, 3],
      })
    }

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      setImages((prev) => ({
        ...prev,
        [type]: { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' },
      }))
    }
  }

  function promptPickImage(type: KycDocumentType) {
    Alert.alert('Dokument hochladen', 'Wie möchtest du das Bild aufnehmen?', [
      { text: 'Kamera', onPress: () => pickImage(type, 'camera') },
      { text: 'Galerie', onPress: () => pickImage(type, 'library') },
      { text: 'Abbrechen', style: 'cancel' },
    ])
  }

  async function handleSubmit() {
    if (!allSelected) return
    setUploading(true)
    setError('')

    try {
      for (const slot of SLOTS) {
        const img = images[slot.type]!
        await kycApi.uploadDocument(slot.type, img.uri, img.mimeType)
      }
      const res = await kycApi.submitForReview()
      updateUser({ verificationStatus: res.data.verificationStatus as any })
      qc.invalidateQueries({ queryKey: ['provider-profile'] })

      Alert.alert(
        'Eingereicht ✓',
        'Deine Dokumente wurden zur Überprüfung eingereicht. Wir melden uns in der Regel innerhalb von 24 Stunden.',
        [{ text: 'OK', onPress: () => router.back() }],
      )
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Identitätsprüfung</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status banner */}
        {isPending ? (
          <View style={[styles.banner, styles.bannerInfo]}>
            <ActivityIndicator color={colors.primary} size="small" style={{ marginRight: spacing.sm }} />
            <Text style={styles.bannerText}>Deine Dokumente werden geprüft. Dies dauert in der Regel 24 Stunden.</Text>
          </View>
        ) : (isRejected || isResubmission) ? (
          <View style={[styles.banner, styles.bannerWarning]}>
            <Text style={styles.bannerText}>⚠️ Deine Verifikation wurde abgelehnt. Bitte lade neue, gut lesbare Dokumente hoch.</Text>
          </View>
        ) : (
          <View style={[styles.banner, styles.bannerNeutral]}>
            <Text style={styles.bannerText}>📋 Lade die folgenden Dokumente hoch, um Zahlungen empfangen zu können.</Text>
          </View>
        )}

        {!isPending && (
          <>
            {/* Document slots */}
            {SLOTS.map((slot, index) => {
              const img = images[slot.type]
              return (
                <View key={slot.type} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepText}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.slotTitle}>{slot.emoji} {slot.title}</Text>
                      <Text style={styles.slotDesc}>{slot.desc}</Text>
                    </View>
                    {img && (
                      <View style={styles.checkBadge}>
                        <Text style={styles.checkText}>✓</Text>
                      </View>
                    )}
                  </View>

                  {img ? (
                    <View style={styles.previewContainer}>
                      <Image source={{ uri: img.uri }} style={styles.preview} resizeMode="cover" />
                      <TouchableOpacity style={styles.removeBtn} onPress={() => setImages((p) => { const n = { ...p }; delete n[slot.type]; return n })}>
                        <Text style={styles.removeBtnText}>✕ Entfernen</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.uploadBtn} onPress={() => promptPickImage(slot.type)}>
                      <Text style={styles.uploadBtnText}>📎 Foto aufnehmen oder auswählen</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })}

            {/* Tips */}
            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>Tipps für gute Fotos</Text>
              {['Alle 4 Ecken des Dokuments sichtbar', 'Gute Beleuchtung, kein Blitz', 'Text klar und lesbar', 'Keine Verdeckungen oder Spiegelungen'].map((tip) => (
                <Text key={tip} style={styles.tip}>• {tip}</Text>
              ))}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, (!allSelected || uploading) && styles.submitBtnDisabled]}
              disabled={!allSelected || uploading}
              onPress={handleSubmit}
            >
              {uploading ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.submitBtnText}>
                  {allSelected ? 'Zur Überprüfung einreichen' : `Noch ${SLOTS.filter((s) => !images[s.type]).length} Dokument(e) ausstehend`}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              Deine Daten werden sicher gespeichert und ausschließlich zur Identitätsprüfung verwendet.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 28, color: colors.primary, lineHeight: 32 },
  headerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  bannerInfo: { backgroundColor: colors.primaryLight },
  bannerWarning: { backgroundColor: colors.warningLight },
  bannerNeutral: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bannerText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  stepBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textInverse },
  slotTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  slotDesc: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  checkBadge: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: colors.secondary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textInverse },
  previewContainer: { alignItems: 'center', gap: spacing.sm },
  preview: { width: '100%', height: 180, borderRadius: radius.md },
  removeBtn: {
    alignSelf: 'stretch', paddingVertical: spacing.sm, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.error, alignItems: 'center',
  },
  removeBtnText: { fontSize: fontSize.sm, color: colors.error, fontWeight: fontWeight.medium },
  uploadBtn: {
    borderWidth: 2, borderStyle: 'dashed', borderColor: colors.borderFocus,
    borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center',
  },
  uploadBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },
  tipsCard: {
    backgroundColor: colors.primaryLight, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  tipsTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.xs },
  tip: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  errorText: { color: colors.error, fontSize: fontSize.sm, textAlign: 'center', marginBottom: spacing.md },
  submitBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: spacing.md + 2, alignItems: 'center', marginBottom: spacing.md,
  },
  submitBtnDisabled: { backgroundColor: colors.textDisabled },
  submitBtnText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textInverse },
  disclaimer: { fontSize: fontSize.xs, color: colors.textDisabled, textAlign: 'center', lineHeight: 18 },
})
