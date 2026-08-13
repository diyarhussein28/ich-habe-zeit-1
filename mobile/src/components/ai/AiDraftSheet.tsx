import React, { useState } from 'react'
import {
  View,
  Text,
  Modal,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../ui/Button'
import { aiApi, type RequestDraft } from '../../api/ai.api'
import { getApiErrorMessage } from '../../api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme'
import { formatEur } from '../../utils/currency'

interface Props {
  visible: boolean
  categoryName?: string
  city?: string
  onApply: (draft: RequestDraft) => void
  onClose: () => void
}

/**
 * Turns a one-line idea into a complete request. The draft is always shown for
 * review before it can be applied — the user stays the author, the assistant
 * only proposes.
 */
export function AiDraftSheet({ visible, categoryName, city, onApply, onClose }: Props) {
  const [rough, setRough] = useState('')
  const [draft, setDraft] = useState<RequestDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const draftMutation = useMutation({
    mutationFn: () => aiApi.draftRequest(rough.trim(), categoryName, city).then((r) => r.data.draft),
    onSuccess: (d) => { setDraft(d); setError(null) },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  const close = () => {
    setRough('')
    setDraft(null)
    setError(null)
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>✨ Mit KI formulieren</Text>
            <Text style={styles.subtitle}>
              Beschreibe kurz, was du brauchst — der Assistent macht daraus einen vollständigen Auftrag.
              Du kannst alles danach noch ändern.
            </Text>

            <TextInput
              style={styles.input}
              value={rough}
              onChangeText={setRough}
              multiline
              textAlignVertical="top"
              placeholder="z.B. wohnzimmer streichen, ca 25qm, weiß"
              placeholderTextColor={colors.textDisabled}
              maxLength={1000}
            />

            {!draft ? (
              <Button
                label="Vorschlag erstellen"
                onPress={() => draftMutation.mutate()}
                loading={draftMutation.isPending}
                disabled={rough.trim().length < 3}
              />
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {draftMutation.isPending ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loadingText}>Der Assistent formuliert deinen Auftrag…</Text>
              </View>
            ) : null}

            {draft ? (
              <View style={styles.preview}>
                <Text style={styles.previewLabel}>Vorschlag</Text>

                <Text style={styles.fieldLabel}>Titel</Text>
                <Text style={styles.fieldValue}>{draft.title}</Text>

                <Text style={styles.fieldLabel}>Beschreibung</Text>
                <Text style={styles.fieldValue}>{draft.description}</Text>

                {draft.suggestedBudgetMin || draft.suggestedBudgetMax ? (
                  <>
                    <Text style={styles.fieldLabel}>Budget-Einschätzung</Text>
                    <Text style={styles.fieldValue}>
                      {draft.suggestedBudgetMin ? formatEur(draft.suggestedBudgetMin) : '—'}
                      {' bis '}
                      {draft.suggestedBudgetMax ? formatEur(draft.suggestedBudgetMax) : '—'}
                    </Text>
                  </>
                ) : null}

                {draft.tips.length > 0 ? (
                  <>
                    <Text style={styles.fieldLabel}>Noch ergänzen</Text>
                    {draft.tips.map((tip, i) => (
                      <Text key={i} style={styles.tip}>• {tip}</Text>
                    ))}
                  </>
                ) : null}

                <View style={styles.actions}>
                  <Button
                    label="Neu generieren"
                    variant="outline"
                    onPress={() => draftMutation.mutate()}
                    loading={draftMutation.isPending}
                    fullWidth={false}
                    style={styles.actionBtn}
                  />
                  <Button
                    label="Übernehmen"
                    onPress={() => { onApply(draft); close() }}
                    fullWidth={false}
                    style={styles.actionBtn}
                  />
                </View>
              </View>
            ) : null}

            <Button label="Abbrechen" variant="outline" onPress={close} style={styles.cancelBtn} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '90%',
  },
  handle: {
    width: 40, height: 4, borderRadius: radius.full,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md,
  },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  subtitle: {
    fontSize: fontSize.sm, color: colors.textSecondary,
    lineHeight: 19, marginTop: spacing.xs, marginBottom: spacing.md,
  },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: fontSize.md, color: colors.text,
    minHeight: 90, marginBottom: spacing.md, backgroundColor: colors.surface,
  },
  error: {
    fontSize: fontSize.sm, color: colors.error, backgroundColor: colors.errorLight,
    padding: spacing.sm, borderRadius: radius.sm, marginTop: spacing.md,
  },
  loading: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  loadingText: { fontSize: fontSize.sm, color: colors.textSecondary },
  preview: {
    marginTop: spacing.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.primary,
    borderRadius: radius.lg, backgroundColor: colors.primaryLight,
  },
  previewLabel: {
    fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.primary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary,
    marginTop: spacing.sm, marginBottom: 2,
  },
  fieldValue: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  tip: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionBtn: { flex: 1 },
  cancelBtn: { marginTop: spacing.md },
})
