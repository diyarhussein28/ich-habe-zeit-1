import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ordersApi } from '../../../src/api/orders.api'
import { ratingsApi } from '../../../src/api/ratings.api'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { Button } from '../../../src/components/ui/Button'
import { StarRating } from '../../../src/components/ui/StarRating'
import { getApiErrorMessage } from '../../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'
import { formatEur } from '../../../src/utils/currency'
import { formatDate } from '../../../src/utils/date'
import { useStripe } from '@stripe/stripe-react-native'

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Zahlung ausstehend',
  IN_PROGRESS: 'In Bearbeitung',
  COMPLETED_BY_PROVIDER: 'Abgeschlossen',
  AWAITING_RELEASE: 'Freigabe ausstehend',
  RELEASED: 'Abgerechnet',
  DISPUTED: 'Streitfall',
  REFUNDED: 'Erstattet',
  PARTIALLY_RELEASED: 'Teilweise ausgezahlt',
  CANCELLED: 'Abgebrochen',
}

const STATUS_COLOR: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  AWAITING_PAYMENT: 'warning',
  IN_PROGRESS: 'primary',
  COMPLETED_BY_PROVIDER: 'success',
  AWAITING_RELEASE: 'warning',
  RELEASED: 'success',
  DISPUTED: 'error',
  REFUNDED: 'neutral',
  CANCELLED: 'neutral',
}

export default function CustomerOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const [showPayModal, setShowPayModal] = useState(false)
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [rating, setRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')

  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [paySuccess, setPaySuccess] = useState(false)
  const [releaseError, setReleaseError] = useState<string | null>(null)
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false)

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.get(id).then((r) => {
      const raw = r.data as unknown as { order?: typeof r.data }
      return raw.order ?? r.data
    }),
    enabled: !!id,
  })

  const handlePay = async () => {
    if (payLoading) return
    setPayLoading(true)
    setPayError(null)
    try {
      if (Platform.OS === 'web') {
        // Web: bypass Stripe, use dev simulation endpoint
        await ordersApi.simulatePayment(id)
        qc.invalidateQueries({ queryKey: ['order', id] })
        qc.invalidateQueries({ queryKey: ['customer-orders'] })
        setShowPayModal(false)
        setPaySuccess(true)
      } else {
        // Native: use Stripe PaymentSheet (useStripe called at top level of the
        // component; Metro aliases the whole module to a safe no-op on web)
        const { data } = await ordersApi.initPayment(id)
        const { clientSecret, paymentIntentId, customerId, ephemeralKeySecret } = data
        const { error: initError } = await initPaymentSheet({
          paymentIntentClientSecret: clientSecret,
          customerId,
          customerEphemeralKeySecret: ephemeralKeySecret,
          merchantDisplayName: 'Ich habe Zeit',
          style: 'automatic',
        })
        if (initError) { setPayError(initError.message); return }
        const { error: presentError } = await presentPaymentSheet()
        if (presentError) {
          if (presentError.code !== 'Canceled') setPayError(presentError.message)
          return
        }
        await ordersApi.confirmPayment(id, paymentIntentId)
        qc.invalidateQueries({ queryKey: ['order', id] })
        qc.invalidateQueries({ queryKey: ['customer-orders'] })
        setShowPayModal(false)
        setPaySuccess(true)
      }
    } catch (err) {
      setPayError(getApiErrorMessage(err))
    } finally {
      setPayLoading(false)
    }
  }

  const releaseMutation = useMutation({
    mutationFn: () => ordersApi.releasePayment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['customer-orders'] })
    },
    onError: (err) => setReleaseError(getApiErrorMessage(err)),
  })

  const disputeMutation = useMutation({
    mutationFn: () => ordersApi.openDispute(id, disputeReason.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] })
      setShowDisputeModal(false)
      setDisputeReason('')
    },
    onError: (err) => Alert.alert('Fehler', getApiErrorMessage(err)),
  })

  const ratingMutation = useMutation({
    mutationFn: () => ratingsApi.submit(id, { rating, comment: ratingComment.trim() || undefined }),
    onSuccess: () => {
      setShowRatingModal(false)
      Alert.alert('Bewertung gespeichert', 'Vielen Dank für deine Bewertung!')
    },
    onError: (err) => Alert.alert('Fehler', getApiErrorMessage(err)),
  })

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (!order) return null

  const providerName =
    order.offer?.provider?.user?.displayName ||
    'Dienstleister'
  const providerInitials = providerName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  const releaseDeadline = order.releaseDeadline ? new Date(order.releaseDeadline) : null
  const hoursLeft = releaseDeadline
    ? Math.max(0, Math.floor((releaseDeadline.getTime() - Date.now()) / (1000 * 60 * 60)))
    : null

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Zurück</Text>
          </TouchableOpacity>
          <Badge
            label={STATUS_LABEL[order.status] ?? order.status}
            color={STATUS_COLOR[order.status] ?? 'neutral'}
          />
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {order.request?.title ?? `Buchung #${id.slice(-6)}`}
        </Text>
        <Text style={styles.date}>
          Erstellt am {formatDate(order.createdAt)}
        </Text>

        {/* Provider card */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Dienstleister</Text>
          <View style={styles.providerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{providerInitials || '?'}</Text>
            </View>
            <View style={styles.providerInfo}>
              <Text style={styles.providerName}>{providerName}</Text>
              {order.offer?.provider && (
                <View style={styles.ratingRow}>
                  <StarRating value={order.offer.provider.averageRating ?? 0} size={14} />
                  <Text style={styles.ratingText}>
                    {order.offer.provider.averageRating?.toFixed(1) ?? '–'} ({order.offer.provider.totalReviews ?? 0} Bewertungen)
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Card>

        {/* Amounts */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Zahlungsübersicht</Text>
          <AmountRow label="Servicebetrag" value={formatEur(order.grossAmount ?? order.totalAmount ?? 0)} />
          <AmountRow label="Plattformgebühr" value={formatEur(order.commissionAmount ?? order.platformFee ?? 0)} />
          <View style={styles.divider} />
          <AmountRow label="Gesamtbetrag" value={formatEur(order.grossAmount ?? order.totalAmount ?? 0)} bold />
        </Card>

        {/* Release countdown */}
        {order.status === 'AWAITING_RELEASE' && hoursLeft !== null && (
          <Card style={[styles.card, styles.countdownCard]}>
            <Text style={styles.countdownTitle}>⏱️ Automatische Freigabe</Text>
            <Text style={styles.countdownText}>
              In <Text style={styles.countdownHours}>{hoursLeft}h</Text> wird die Zahlung automatisch freigegeben, wenn du nicht handelst.
            </Text>
          </Card>
        )}

        {paySuccess && (
          <Card style={[styles.card, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}>
            <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: '#16A34A' }}>
              ✓ Zahlung erfolgreich gesichert! Der Auftrag ist jetzt aktiv.
            </Text>
          </Card>
        )}

        {/* Status-specific actions */}
        {order.status === 'AWAITING_PAYMENT' && (
          <Button
            label={`Jetzt bezahlen – ${formatEur(order.grossAmount ?? order.totalAmount ?? 0)}`}
            onPress={() => setShowPayModal(true)}
            style={styles.actionBtn}
          />
        )}

        {order.status === 'AWAITING_RELEASE' && (
          <>
            {showReleaseConfirm ? (
              <Card style={[styles.card, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}>
                <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm }}>
                  Zahlung freigeben?
                </Text>
                <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md }}>
                  Damit wird der Betrag von {formatEur(order.netProviderAmount ?? order.providerAmount ?? 0)} an den Dienstleister ausgezahlt.
                </Text>
                {releaseError ? <Text style={styles.errorText}>{releaseError}</Text> : null}
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <Button label="Abbrechen" variant="outline" fullWidth={false} style={{ flex: 1 }} onPress={() => setShowReleaseConfirm(false)} />
                  <Button label="Freigeben ✓" fullWidth={false} style={{ flex: 1 }} loading={releaseMutation.isPending} onPress={() => releaseMutation.mutate()} />
                </View>
              </Card>
            ) : (
              <Button
                label="Zahlung freigeben ✓"
                onPress={() => setShowReleaseConfirm(true)}
                style={styles.actionBtn}
              />
            )}
            <Button
              label="Streitfall eröffnen"
              variant="danger"
              onPress={() => setShowDisputeModal(true)}
              style={styles.actionBtn}
            />
          </>
        )}

        {order.status === 'RELEASED' && (
          <Button
            label="Dienstleister bewerten"
            variant="outline"
            onPress={() => setShowRatingModal(true)}
            style={styles.actionBtn}
          />
        )}

        {/* Chat link */}
        {['IN_PROGRESS', 'COMPLETED_BY_PROVIDER', 'AWAITING_RELEASE', 'DISPUTED'].includes(order.status) && (
          <TouchableOpacity
            onPress={() => router.push(`/chat/${order.id}`)}
            style={styles.chatLink}
          >
            <Text style={styles.chatLinkText}>💬 Chat mit Dienstleister öffnen</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Payment modal */}
      <Modal visible={showPayModal} animationType="slide" transparent onRequestClose={() => setShowPayModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Zahlung</Text>
            <Text style={styles.modalSubtitle}>
              Dein Geld wird sicher auf einem Treuhandkonto gehalten und erst nach deiner Freigabe an den Dienstleister ausgezahlt.
            </Text>

            <View style={styles.payRow}>
              <Text style={styles.payLabel}>Gesamtbetrag</Text>
              <Text style={styles.payAmount}>{formatEur(order.grossAmount ?? order.totalAmount ?? 0)}</Text>
            </View>

            <Card style={styles.escrowInfo}>
              <Text style={styles.escrowText}>
                🔒 Gesicherte Zahlung über Stripe. Du kannst nach Abschluss freigeben oder einen Streitfall eröffnen.
              </Text>
            </Card>

            {payError ? <Text style={styles.errorText}>{payError}</Text> : null}
            {Platform.OS === 'web' && (
              <Text style={styles.webSimNote}>⚠️ Web-Demo: Zahlung wird simuliert (kein echtes Stripe)</Text>
            )}
            <View style={styles.modalActions}>
              <Button label="Abbrechen" variant="outline" onPress={() => { setShowPayModal(false); setPayError(null) }} fullWidth={false} style={styles.modalBtn} />
              <Button
                label="Jetzt bezahlen"
                onPress={handlePay}
                loading={payLoading}
                fullWidth={false}
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Dispute modal */}
      <Modal visible={showDisputeModal} animationType="slide" transparent onRequestClose={() => setShowDisputeModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Streitfall eröffnen</Text>
            <Text style={styles.modalSubtitle}>
              Beschreibe das Problem. Unser Team wird sich innerhalb von 24 Stunden melden.
            </Text>
            <TextInput
              style={styles.disputeInput}
              value={disputeReason}
              onChangeText={setDisputeReason}
              placeholder="Was ist das Problem? Bitte sei so genau wie möglich..."
              placeholderTextColor={colors.textDisabled}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <Button label="Abbrechen" variant="outline" onPress={() => setShowDisputeModal(false)} fullWidth={false} style={styles.modalBtn} />
              <Button
                label="Einreichen"
                variant="danger"
                onPress={() => {
                  if (!disputeReason.trim() || disputeReason.trim().length < 10) {
                    Alert.alert('Fehler', 'Bitte beschreibe das Problem (mindestens 10 Zeichen).')
                    return
                  }
                  disputeMutation.mutate()
                }}
                loading={disputeMutation.isPending}
                fullWidth={false}
                style={styles.modalBtn}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Rating modal */}
      <Modal visible={showRatingModal} animationType="slide" transparent onRequestClose={() => setShowRatingModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Bewertung abgeben</Text>
            <Text style={styles.modalSubtitle}>{providerName} bewerten</Text>
            <View style={styles.starsCenter}>
              <StarRating value={rating} onPress={setRating} size={40} />
            </View>
            <TextInput
              style={styles.ratingInput}
              value={ratingComment}
              onChangeText={setRatingComment}
              placeholder="Kommentar (optional)..."
              placeholderTextColor={colors.textDisabled}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <Button label="Überspringen" variant="ghost" onPress={() => setShowRatingModal(false)} fullWidth={false} style={styles.modalBtn} />
              <Button
                label="Bewertung senden"
                onPress={() => {
                  if (rating === 0) { Alert.alert('Fehler', 'Bitte wähle eine Bewertung.'); return }
                  ratingMutation.mutate()
                }}
                loading={ratingMutation.isPending}
                fullWidth={false}
                style={styles.modalBtn}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

function AmountRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={amountStyles.row}>
      <Text style={[amountStyles.label, bold ? amountStyles.bold : null]}>{label}</Text>
      <Text style={[amountStyles.value, bold ? amountStyles.bold : null]}>{value}</Text>
    </View>
  )
}

const amountStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs + 2 },
  label: { fontSize: fontSize.sm, color: colors.textSecondary },
  value: { fontSize: fontSize.sm, color: colors.text },
  bold: { fontWeight: fontWeight.bold, fontSize: fontSize.md, color: colors.text },
})

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.medium },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs, lineHeight: 28 },
  date: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  sectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.md },
  providerRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  avatarText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primary },
  providerInfo: { flex: 1 },
  providerName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 4 },
  ratingText: { fontSize: fontSize.xs, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  countdownCard: { backgroundColor: colors.warningLight, borderColor: colors.warning },
  countdownTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  countdownText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  countdownHours: { fontWeight: fontWeight.bold, color: colors.warning },
  actionBtn: { marginBottom: spacing.sm },
  chatLink: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  chatLinkText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.medium },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  modalSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 20 },
  cardDisplay: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardLabel: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold, marginBottom: spacing.xs },
  cardNumber: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, letterSpacing: 2, marginBottom: spacing.xs },
  cardMeta: { fontSize: fontSize.sm, color: colors.textSecondary },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  payLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  payAmount: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text },
  escrowInfo: { backgroundColor: colors.primaryLight, borderColor: colors.primary, marginBottom: spacing.lg },
  escrowText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  disputeInput: {
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    height: 100,
    marginBottom: spacing.lg,
  },
  starsCenter: { alignItems: 'center', marginVertical: spacing.lg },
  ratingInput: {
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    height: 80,
    marginBottom: spacing.lg,
  },
  modalActions: { flexDirection: 'row', gap: spacing.md },
  modalBtn: { flex: 1 },
  errorText: { fontSize: fontSize.sm, color: colors.error, backgroundColor: '#fee2e2', padding: spacing.sm, borderRadius: 6, marginBottom: spacing.sm },
  webSimNote: { fontSize: fontSize.xs, color: '#92400e', backgroundColor: '#fef3c7', padding: spacing.sm, borderRadius: 6, marginBottom: spacing.sm, textAlign: 'center' },
})
