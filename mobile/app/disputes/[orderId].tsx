import React, { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image, Linking, TextInput } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { disputesApi, DISPUTE_REASON_CATEGORY_LABEL, DISPUTE_STATUS_LABEL, DISPUTE_OUTCOME_LABEL } from '../../src/api/disputes.api'
import { mediaApi } from '../../src/api/media.api'
import { useAuthStore } from '../../src/store/auth.store'
import { useOrderLiveSync } from '../../src/hooks/useOrderLiveSync'
import { Card } from '../../src/components/ui/Card'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { getApiErrorMessage } from '../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'
import { formatDate } from '../../src/utils/date'
import type { DisputeEvidence, DisputeStatus } from '../../src/api/types'

const STATUS_COLOR: Record<DisputeStatus, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  OPEN: 'warning',
  IN_REVIEW: 'primary',
  PENDING_DECISION: 'primary',
  RESOLVED: 'success',
  ESCALATED: 'neutral',
}

export default function DisputeDetailScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [uploading, setUploading] = useState(false)
  const [agrees, setAgrees] = useState<boolean | null>(null)
  const [responseText, setResponseText] = useState('')
  const [responseError, setResponseError] = useState<string | null>(null)
  useOrderLiveSync(orderId)

  const { data: dispute, isLoading } = useQuery({
    queryKey: ['dispute', orderId],
    queryFn: () => disputesApi.get(orderId).then((r) => r.data.dispute),
    enabled: !!orderId,
  })

  const reasonLabel = dispute ? (DISPUTE_REASON_CATEGORY_LABEL[dispute.reasonCategory] ?? dispute.reasonCategory) : ''

  const isCustomer = dispute?.order?.customerId === user?.id
  const mySide: 'customer' | 'provider' = isCustomer ? 'customer' : 'provider'
  const myEvidence = dispute?.evidence.filter((e) => e.side === mySide) ?? []
  const theirEvidence = dispute?.evidence.filter((e) => e.side !== mySide) ?? []
  const isOpener = dispute?.openedById === user?.id
  const needsResponse = !!dispute && !isOpener && !dispute.respondedById && dispute.status !== 'RESOLVED'

  const respondMutation = useMutation({
    mutationFn: () => disputesApi.respond(orderId, agrees === true, responseText.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispute', orderId] })
      setResponseError(null)
    },
    onError: (err) => setResponseError(getApiErrorMessage(err)),
  })

  function handleSubmitResponse() {
    if (agrees === null) {
      setResponseError('Bitte wähle eine Option.')
      return
    }
    if (responseText.trim().length < 20) {
      setResponseError('Bitte beschreibe deine Sicht genauer (mindestens 20 Zeichen).')
      return
    }
    setResponseError(null)
    respondMutation.mutate()
  }

  async function handleUpload() {
    if (!dispute) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (perm.status !== 'granted') {
      Alert.alert('Zugriff benötigt', 'Bitte erlaube den Zugriff auf deine Fotos in den Einstellungen.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 })
    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    setUploading(true)
    try {
      const mimeType = asset.mimeType ?? 'image/jpeg'
      const url = await mediaApi.upload('DISPUTE_EVIDENCE', asset.uri, mimeType)
      await disputesApi.addEvidence(orderId, {
        fileUrl: url,
        fileName: asset.fileName ?? `beweis-${Date.now()}.jpg`,
        fileType: mimeType,
        fileSizeBytes: asset.fileSize ?? 0,
      })
      qc.invalidateQueries({ queryKey: ['dispute', orderId] })
    } catch (err) {
      Alert.alert('Fehler', getApiErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (!dispute) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Kein Streitfall gefunden.</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Zurück</Text>
        </TouchableOpacity>
        <Badge label={DISPUTE_STATUS_LABEL[dispute.status] ?? dispute.status} color={STATUS_COLOR[dispute.status] ?? 'neutral'} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Streitfall</Text>
        <Text style={styles.date}>Eröffnet am {formatDate(dispute.createdAt)}</Text>

        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Grund</Text>
          <Text style={styles.reasonText}>{reasonLabel}</Text>
          <Text style={styles.sectionLabel}>Beschreibung</Text>
          <Text style={styles.descriptionText}>{dispute.description}</Text>
        </Card>

        {dispute.respondedById && (
          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>Antwort der Gegenseite</Text>
            <Text style={styles.reasonText}>
              {dispute.responseAgreesWithClaim ? '✅ Stimmt der Darstellung zu' : '❌ Sieht es anders'}
            </Text>
            {dispute.responseDescription ? <Text style={styles.descriptionText}>{dispute.responseDescription}</Text> : null}
          </Card>
        )}

        {needsResponse && (
          <Card style={[styles.card, styles.responseCard]}>
            <Text style={styles.sectionLabel}>Deine Antwort ist gefragt</Text>
            <Text style={styles.descriptionText}>
              Die Gegenseite hat diesen Streitfall eröffnet. Bitte gib deine Sicht der Dinge an, bevor unser Team entscheidet.
            </Text>

            <View style={styles.agreeRow}>
              <TouchableOpacity
                onPress={() => setAgrees(true)}
                style={[styles.agreeBtn, agrees === true && styles.agreeBtnActive]}
              >
                <Text style={[styles.agreeBtnText, agrees === true && styles.agreeBtnTextActive]}>Ich stimme zu</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setAgrees(false)}
                style={[styles.agreeBtn, agrees === false && styles.disagreeBtnActive]}
              >
                <Text style={[styles.agreeBtnText, agrees === false && styles.agreeBtnTextActive]}>Ich sehe es anders</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              value={responseText}
              onChangeText={setResponseText}
              placeholder="Beschreibe deine Sicht der Dinge..."
              placeholderTextColor={colors.textDisabled}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            {responseError ? <Text style={styles.errorText}>{responseError}</Text> : null}

            <Button
              label="Antwort senden"
              onPress={handleSubmitResponse}
              loading={respondMutation.isPending}
              style={styles.responseSubmitBtn}
            />
          </Card>
        )}

        {dispute.status === 'RESOLVED' && dispute.outcome && (
          <Card style={[styles.card, styles.resolutionCard]}>
            <Text style={styles.sectionLabel}>Entscheidung</Text>
            <Text style={styles.outcomeText}>{DISPUTE_OUTCOME_LABEL[dispute.outcome] ?? dispute.outcome}</Text>
            {dispute.resolutionNote ? <Text style={styles.descriptionText}>{dispute.resolutionNote}</Text> : null}
            {dispute.resolvedAt ? <Text style={styles.date}>Entschieden am {formatDate(dispute.resolvedAt)}</Text> : null}
          </Card>
        )}

        {dispute.status !== 'RESOLVED' && (
          <Card style={styles.infoCard}>
            <Text style={styles.infoText}>
              ⏳ Unser Team prüft den Fall und meldet sich in der Regel innerhalb von 24 Stunden. Die Zahlung bleibt bis zur Entscheidung eingefroren.
            </Text>
          </Card>
        )}

        <Card style={styles.card}>
          <View style={styles.evidenceHeader}>
            <Text style={styles.sectionLabel}>Deine Beweise</Text>
            {dispute.status !== 'RESOLVED' && (
              <TouchableOpacity onPress={handleUpload} disabled={uploading} style={styles.uploadBtn}>
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.uploadBtnText}>+ Beweis hochladen</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
          <EvidenceGrid items={myEvidence} emptyText="Noch keine Beweise hochgeladen." />

          <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>Beweise der Gegenseite</Text>
          <EvidenceGrid items={theirEvidence} emptyText="Noch keine Beweise von der Gegenseite." />
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}

function EvidenceGrid({ items, emptyText }: { items: DisputeEvidence[]; emptyText: string }) {
  if (items.length === 0) {
    return <Text style={styles.emptyEvidenceText}>{emptyText}</Text>
  }
  return (
    <View style={styles.evidenceGrid}>
      {items.map((item) => (
        <TouchableOpacity key={item.id} onPress={() => Linking.openURL(item.fileUrl)} style={styles.evidenceThumb}>
          {item.fileType.startsWith('image/') ? (
            <Image source={{ uri: item.fileUrl }} style={styles.evidenceImage} />
          ) : (
            <View style={styles.evidenceFileIcon}>
              <Text style={{ fontSize: 24 }}>📄</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.medium },
  content: { padding: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text },
  date: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.md },
  card: { marginBottom: spacing.md },
  sectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs },
  reasonText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.md },
  descriptionText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  resolutionCard: { borderWidth: 1, borderColor: colors.secondary },
  responseCard: { borderWidth: 1, borderColor: colors.primary },
  agreeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  agreeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  agreeBtnActive: { borderColor: colors.secondary, backgroundColor: colors.secondaryLight },
  disagreeBtnActive: { borderColor: colors.error, backgroundColor: colors.errorLight },
  agreeBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  agreeBtnTextActive: { color: colors.text },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: fontSize.sm, color: colors.text, minHeight: 90, backgroundColor: colors.surface, marginBottom: spacing.sm,
  },
  errorText: { fontSize: fontSize.sm, color: colors.error, marginBottom: spacing.sm },
  responseSubmitBtn: { marginTop: spacing.xs },
  outcomeText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  infoCard: { backgroundColor: colors.primaryLight, marginBottom: spacing.md },
  infoText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  evidenceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  uploadBtn: { paddingVertical: 4 },
  uploadBtnText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold },
  emptyEvidenceText: { fontSize: fontSize.xs, color: colors.textDisabled, fontStyle: 'italic' },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  evidenceThumb: { width: 72, height: 72, borderRadius: radius.md, overflow: 'hidden' },
  evidenceImage: { width: '100%', height: '100%', backgroundColor: colors.border },
  evidenceFileIcon: { width: '100%', height: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
})
