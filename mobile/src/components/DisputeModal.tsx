import React, { useState } from 'react'
import { View, Text, Modal, TextInput, TouchableOpacity, Image, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { disputesApi } from '../api/disputes.api'
import { mediaApi } from '../api/media.api'
import { getDisputeCategories, type DisputeAnswer, type DisputeCategoryConfig, type DisputeQuestionNode } from '../constants/disputeFlow'
import { Button } from './ui/Button'
import { getApiErrorMessage } from '../api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../constants/theme'

const MIN_DESCRIPTION_LENGTH = 50

type PendingFile = { fileUrl: string; fileName: string; fileType: string; fileSizeBytes: number }

type WizardStep =
  | { kind: 'category' }
  | { kind: 'question'; node: DisputeQuestionNode }
  | { kind: 'details' }

export function DisputeModal({
  orderId,
  role,
  visible,
  onClose,
  onSuccess,
}: {
  orderId: string
  role: 'customer' | 'provider'
  visible: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const qc = useQueryClient()
  const [stepStack, setStepStack] = useState<WizardStep[]>([{ kind: 'category' }])
  const [category, setCategory] = useState<DisputeCategoryConfig | null>(null)
  const [answers, setAnswers] = useState<Record<string, DisputeAnswer>>({})
  const [evidenceForced, setEvidenceForced] = useState(false)
  const [description, setDescription] = useState('')
  const [evidence, setEvidence] = useState<PendingFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const step = stepStack[stepStack.length - 1]
  const categories = getDisputeCategories(role)

  function reset() {
    setStepStack([{ kind: 'category' }])
    setCategory(null)
    setAnswers({})
    setEvidenceForced(false)
    setDescription('')
    setEvidence([])
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function selectCategory(cat: DisputeCategoryConfig) {
    setCategory(cat)
    if (cat.evidenceRequiredByDefault) setEvidenceForced(true)
    if (cat.firstQuestion) {
      setStepStack((s) => [...s, { kind: 'question', node: cat.firstQuestion! }])
    } else {
      setStepStack((s) => [...s, { kind: 'details' }])
    }
  }

  function selectOption(node: DisputeQuestionNode, option: DisputeQuestionNode['options'][number]) {
    setAnswers((prev) => ({ ...prev, [node.key]: { key: node.key, question: node.question, answer: option.label } }))
    if (option.forcesEvidence) setEvidenceForced(true)
    if (option.next) {
      setStepStack((s) => [...s, { kind: 'question', node: option.next! }])
    } else {
      setStepStack((s) => [...s, { kind: 'details' }])
    }
  }

  function goBack() {
    setStepStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
  }

  async function handleUpload() {
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
      setEvidence((prev) => [
        ...prev,
        { fileUrl: url, fileName: asset.fileName ?? `beweis-${Date.now()}.jpg`, fileType: mimeType, fileSizeBytes: asset.fileSize ?? 0 },
      ])
    } catch (err) {
      Alert.alert('Fehler', getApiErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!category) throw new Error('NO_CATEGORY')
      await disputesApi.open(orderId, category.value, description.trim(), Object.values(answers))
      for (const file of evidence) {
        await disputesApi.addEvidence(orderId, file)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] })
      qc.invalidateQueries({ queryKey: ['dispute', orderId] })
      reset()
      onSuccess()
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  function handleSubmit() {
    if (description.trim().length < MIN_DESCRIPTION_LENGTH) {
      setError(`Bitte beschreibe die Situation genauer (mindestens ${MIN_DESCRIPTION_LENGTH} Zeichen).`)
      return
    }
    if (evidenceForced && evidence.length === 0) {
      setError('Für diese Angabe wird mindestens ein Beweisfoto benötigt.')
      return
    }
    setError(null)
    mutation.mutate()
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            {stepStack.length > 1 ? (
              <TouchableOpacity onPress={goBack}>
                <Text style={styles.backLink}>← Zurück</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.closeLink}>Abbrechen</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {step.kind === 'category' && (
              <>
                <Text style={styles.title}>Streitfall eröffnen</Text>
                <Text style={styles.subtitle}>Was ist das Problem?</Text>
                {categories.map((cat) => (
                  <TouchableOpacity key={cat.value} onPress={() => selectCategory(cat)} style={styles.optionRow}>
                    <Text style={styles.optionText}>{cat.label}</Text>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {step.kind === 'question' && (
              <>
                <Text style={styles.title}>{category?.label}</Text>
                <Text style={styles.subtitle}>{step.node.question}</Text>
                {step.node.options.map((opt) => (
                  <TouchableOpacity key={opt.value} onPress={() => selectOption(step.node, opt)} style={styles.optionRow}>
                    <Text style={styles.optionText}>{opt.label}</Text>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {step.kind === 'details' && (
              <>
                <Text style={styles.title}>Details</Text>
                <Text style={styles.subtitle}>
                  Beschreibe die Situation kurz in eigenen Worten. Unser Team meldet sich in der Regel innerhalb von 24 Stunden.
                </Text>

                <TextInput
                  style={styles.input}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Was genau ist passiert?"
                  placeholderTextColor={colors.textDisabled}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                <Text style={styles.counter}>{description.trim().length} / {MIN_DESCRIPTION_LENGTH} Zeichen mindestens</Text>

                <Text style={styles.label}>
                  Beweise {evidenceForced ? '(erforderlich)' : '(optional)'}
                </Text>
                <View style={styles.evidenceGrid}>
                  {evidence.map((f) => (
                    <Image key={f.fileUrl} source={{ uri: f.fileUrl }} style={styles.evidenceThumb} />
                  ))}
                  <TouchableOpacity onPress={handleUpload} disabled={uploading} style={styles.addTile}>
                    {uploading ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.addIcon}>+</Text>}
                  </TouchableOpacity>
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <View style={styles.actions}>
                  <Button label="Abbrechen" variant="outline" onPress={handleClose} fullWidth={false} style={styles.btn} />
                  <Button label="Einreichen" variant="danger" loading={mutation.isPending} onPress={handleSubmit} fullWidth={false} style={styles.btn} />
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.5)' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '85%' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  backLink: { fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.medium },
  closeLink: { fontSize: fontSize.sm, color: colors.textSecondary },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: spacing.sm,
  },
  optionText: { fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium, flex: 1 },
  chevron: { fontSize: fontSize.lg, color: colors.textSecondary },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: fontSize.sm, color: colors.text, minHeight: 100, backgroundColor: colors.surface,
  },
  counter: { fontSize: fontSize.xs, color: colors.textDisabled, marginTop: spacing.xs, textAlign: 'right', marginBottom: spacing.md },
  label: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text, marginBottom: spacing.xs },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  evidenceThumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.border },
  addTile: {
    width: 64, height: 64, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background,
  },
  addIcon: { fontSize: 22, color: colors.primary },
  error: { fontSize: fontSize.sm, color: colors.error, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, marginBottom: spacing.md },
  btn: { flex: 1 },
})
