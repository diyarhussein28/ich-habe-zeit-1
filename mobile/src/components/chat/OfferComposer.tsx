import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  Modal,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { Button } from '../ui/Button'
import { colors, spacing, fontSize, fontWeight, radius } from '../../constants/theme'

export interface OfferDraft {
  proposedPrice: number
  scopeOfWork: string
  estimatedDurationDays?: number
}

interface Props {
  visible: boolean
  /** Set when countering — prefills from the offer being countered. */
  counteringPrice?: number
  counteringScope?: string
  isCounter: boolean
  submitting: boolean
  error?: string | null
  onSubmit: (draft: OfferDraft) => void
  onCancel: () => void
}

export function OfferComposer({
  visible,
  counteringPrice,
  counteringScope,
  isCounter,
  submitting,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const [price, setPrice] = useState('')
  const [scope, setScope] = useState('')
  const [days, setDays] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  // Reset/prefill each time the sheet opens so a previous draft never leaks
  // into a new negotiation step.
  useEffect(() => {
    if (visible) {
      setPrice(counteringPrice != null ? String(counteringPrice) : '')
      setScope(counteringScope ?? '')
      setDays('')
      setLocalError(null)
    }
  }, [visible, counteringPrice, counteringScope])

  const submit = () => {
    const parsedPrice = Number(price.replace(',', '.'))
    if (!parsedPrice || parsedPrice <= 0) {
      setLocalError('Bitte gib einen gültigen Preis ein.')
      return
    }
    if (scope.trim().length < 5) {
      setLocalError('Bitte beschreibe kurz, was enthalten ist (mind. 5 Zeichen).')
      return
    }
    const parsedDays = days ? Number(days) : undefined
    if (parsedDays !== undefined && (!Number.isFinite(parsedDays) || parsedDays < 1)) {
      setLocalError('Die Dauer muss mindestens 1 Tag sein.')
      return
    }
    setLocalError(null)
    onSubmit({
      proposedPrice: parsedPrice,
      scopeOfWork: scope.trim(),
      estimatedDurationDays: parsedDays,
    })
  }

  const shownError = localError ?? error

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>
              {isCounter ? 'Gegenangebot senden' : 'Angebot senden'}
            </Text>
            <Text style={styles.subtitle}>
              {isCounter
                ? 'Das bisherige Angebot wird ersetzt. Die andere Seite kann annehmen, ablehnen oder erneut verhandeln.'
                : 'Beide Seiten können verhandeln, bis ihr euch einig seid.'}
            </Text>

            <Text style={styles.label}>Preis (€) *</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="z.B. 180"
              placeholderTextColor={colors.textDisabled}
            />

            <Text style={styles.label}>Was ist enthalten? *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={scope}
              onChangeText={setScope}
              multiline
              textAlignVertical="top"
              placeholder="z.B. Wände streichen inkl. Material, 2 Räume"
              placeholderTextColor={colors.textDisabled}
            />

            <Text style={styles.label}>Dauer in Tagen (optional)</Text>
            <TextInput
              style={styles.input}
              value={days}
              onChangeText={(v) => setDays(v.replace(/\D/g, '').slice(0, 3))}
              keyboardType="number-pad"
              placeholder="z.B. 2"
              placeholderTextColor={colors.textDisabled}
            />

            {shownError ? <Text style={styles.error}>{shownError}</Text> : null}

            <View style={styles.actions}>
              <Button
                label="Abbrechen"
                variant="outline"
                onPress={onCancel}
                fullWidth={false}
                style={styles.actionBtn}
              />
              <Button
                label={isCounter ? 'Gegenangebot senden' : 'Angebot senden'}
                onPress={submit}
                loading={submitting}
                fullWidth={false}
                style={styles.actionBtn}
              />
            </View>
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
    maxHeight: '88%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 19,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  textArea: { minHeight: 90 },
  error: {
    fontSize: fontSize.sm,
    color: colors.error,
    backgroundColor: colors.errorLight,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.md,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  actionBtn: { flex: 1 },
})
