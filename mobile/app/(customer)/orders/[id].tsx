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
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useStripe } from '@stripe/stripe-react-native'
import { ordersApi } from '../../../src/api/orders.api'
import { ratingsApi } from '../../../src/api/ratings.api'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { Button } from '../../../src/components/ui/Button'
import { StarRating } from '../../../src/components/ui/StarRating'
import { getApiErrorMessage } from '../../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'

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
  const [showPayModal, setShowPayModal] = useState(false)
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [rating, setRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')

  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const [payLoading, setPayLoading] = useState(false)

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.get(id).then((r) => r.data),
    enabled: !!id,
  })

  const handlePay = async () => {
    if (payLoading) return
    setPayLoading(true)
    try {
      // 1. Create PaymentIntent on backend
      const { data } = await ordersApi.initPayment(id)
      const { clientSecret, paymentIntentId } = data

      // 2. Init Stripe PaymentSheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'Ich habe Zeit',
        style: 'automatic',
        primaryButtonLabel: `${order?.totalAmount?.toFixed(2) ?? '0.00'} € bezahlen`,
      })
      if (initError) {
        Alert.alert('Fehler', initError.message)
        return
      }

      // 3. Present the sheet — user enters card details
      const { error: presentError } = await presentPaymentSheet()
      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Zahlung fehlgeschlagen', presentError.message)
        }
        return
      }

      // 4. Confirm on backend (marks order IN_PROGRESS)
      await ordersApi.confirmPayment(id, paymentIntentId)
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['customer-orders'] })
      setShowPayModal(false)
      Alert.alert('Zahlung erfolgreich', 'Deine Zahlung wurde gesichert. Der Auftrag ist jetzt aktiv.')
    } catch (err) {
      Alert.alert('Fehler', getApiErrorMessage(err))
    } finally {
      setPayLoading(false)
    }
  }

  const releaseMutation = useMutation({
    mutationFn: () => ordersApi.releasePayment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['customer-orders'] })
      Alert.alert('Zahlung freigegeben', 'Der Betrag wurde an den Dienstleister ausgezahlt.')
    },
    onError: (err) => Alert.alert('Fehler', getApiErrorMessage(err)),
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
    order.offer?.provider?.user
      ? `${order.offer.provider.user.firstName ?? ''} ${order.offer.provider.user.lastName ?? ''}`.trim()
      : 'Dienstleister'
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
          Erstellt am {new Date(order.createdAt).toLocaleDateString('de-DE')}
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
          <AmountRow label="Servicebetrag" value={`${order.totalAmount.toFixed(2)} €`} />
          <AmountRow label="Plattformgebühr" value={`${order.platformFee.toFixed(2)} €`} />
          <View style={styles.divider} />
          <AmountRow label="Gesamtbetrag" value={`${order.totalAmount.toFixed(2)} €`} bold />
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

        {/* Status-specific actions */}
        {order.status === 'AWAITING_PAYMENT' && (
          <Button
            label={`Jetzt bezahlen – ${order.totalAmount.toFixed(2)} €`}
            onPress={() => setShowPayModal(true)}
            style={styles.actionBtn}
          />
        )}

        {order.status === 'AWAITING_RELEASE' && (
          <>
            <Button
              label="Zahlung freigeben ✓"
              onPress={() =>
                Alert.alert(
                  'Zahlung freigeben',
                  `Bist du mit der Arbeit zufrieden? Damit wird der Betrag von ${order.providerAmount.toFixed(2)} € an den Dienstleister ausgezahlt.`,
                  [
                    { text: 'Abbrechen', style: 'cancel' },
                    { text: 'Freigeben', onPress: () => releaseMutation.mutate() },
                  ],
                )
              }
              loading={releaseMutation.isPending}
              style={styles.actionBtn}
            />
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
              <Text style={styles.payAmount}>{order.totalAmount.toFixed(2)} €</Text>
            </View>

            <Card style={styles.escrowInfo}>
              <Text style={styles.escrowText}>
                🔒 Gesicherte Zahlung über Stripe. Du kannst nach Abschluss freigeben oder einen Streitfall eröffnen.
              </Text>
            </Card>

            <View style={styles.modalActions}>
              <Button label="Abbrechen" variant="outline" onPress={() => setShowPayModal(false)} fullWidth={false} style={styles.modalBtn} />
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
        <View style={styles.modalOverlay}>
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
        </View>
      </Modal>

      {/* Rating modal */}
      <Modal visible={showRatingModal} animationType="slide" transparent onRequestClose={() => setShowRatingModal(false)}>
        <View style={styles.modalOverlay}>
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
        </View>
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
})
