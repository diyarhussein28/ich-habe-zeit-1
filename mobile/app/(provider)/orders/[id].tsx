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
import { ordersApi } from '../../../src/api/orders.api'
import { ratingsApi } from '../../../src/api/ratings.api'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { Button } from '../../../src/components/ui/Button'
import { StarRating } from '../../../src/components/ui/StarRating'
import { getApiErrorMessage } from '../../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Warte auf Kundenzahlung',
  IN_PROGRESS: 'Aktiv',
  COMPLETED_BY_PROVIDER: 'Abgezeichnet (warte auf Freigabe)',
  AWAITING_RELEASE: 'Freigabe läuft',
  RELEASED: 'Ausgezahlt',
  DISPUTED: 'Streitfall',
  CANCELLED: 'Abgebrochen',
}

const STATUS_COLOR: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  AWAITING_PAYMENT: 'warning',
  IN_PROGRESS: 'primary',
  COMPLETED_BY_PROVIDER: 'success',
  AWAITING_RELEASE: 'warning',
  RELEASED: 'success',
  DISPUTED: 'error',
  CANCELLED: 'neutral',
}

export default function ProviderOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [rating, setRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.get(id).then((r) => r.data),
    enabled: !!id,
  })

  const completeMutation = useMutation({
    mutationFn: () => ordersApi.markComplete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['provider-orders'] })
      Alert.alert(
        'Auftrag abgezeichnet',
        'Der Kunde wird benachrichtigt und hat nun die Möglichkeit, die Zahlung freizugeben oder einen Streitfall zu eröffnen.',
      )
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

  const releaseDeadline = order.releaseDeadline ? new Date(order.releaseDeadline) : null
  const hoursLeft = releaseDeadline
    ? Math.max(0, Math.floor((releaseDeadline.getTime() - Date.now()) / (1000 * 60 * 60)))
    : null

  const customerFirstName = (order.request?.customer as { firstName?: string } | undefined)?.firstName ?? 'Auftraggeber'

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
          {order.request?.title ?? `Auftrag #${id.slice(-6)}`}
        </Text>
        <Text style={styles.date}>
          Erstellt am {new Date(order.createdAt).toLocaleDateString('de-DE')}
        </Text>

        {/* Earnings */}
        <Card style={[styles.card, styles.earningsCard]}>
          <Text style={styles.earningsLabel}>Deine Auszahlung</Text>
          <Text style={styles.earningsAmount}>{order.providerAmount.toFixed(2)} €</Text>
          <Text style={styles.earningsNote}>
            (nach Plattformgebühr {order.platformFee.toFixed(2)} €)
          </Text>
        </Card>

        {/* Order info */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Auftrag</Text>
          <Text style={styles.serviceTitle}>{order.request?.title}</Text>
          {order.request?.description ? (
            <Text style={styles.serviceDesc} numberOfLines={3}>{order.request.description}</Text>
          ) : null}
          {order.request?.plz && (
            <Text style={styles.location}>📍 {order.request.city} {order.request.plz}</Text>
          )}
        </Card>

        {/* Release countdown */}
        {['AWAITING_RELEASE', 'COMPLETED_BY_PROVIDER'].includes(order.status) && hoursLeft !== null && (
          <Card style={[styles.card, styles.countdownCard]}>
            <Text style={styles.countdownTitle}>⏱️ Automatische Freigabe</Text>
            <Text style={styles.countdownText}>
              In <Text style={styles.countdownHours}>{hoursLeft}h</Text> wird die Zahlung automatisch an dich überwiesen, wenn der Kunde keine Aktion durchführt.
            </Text>
          </Card>
        )}

        {/* Dispute info */}
        {order.status === 'DISPUTED' && (
          <Card style={[styles.card, styles.disputeCard]}>
            <Text style={styles.disputeTitle}>⚠️ Streitfall aktiv</Text>
            <Text style={styles.disputeText}>
              Dieser Auftrag wird von unserem Team geprüft. Bitte reiche alle relevanten Beweise im Chat ein.
            </Text>
          </Card>
        )}

        {/* Actions */}
        {order.status === 'IN_PROGRESS' && (
          <Button
            label="Arbeit abschließen ✓"
            onPress={() =>
              Alert.alert(
                'Auftrag abschließen',
                'Bestätige, dass alle vereinbarten Leistungen erbracht wurden. Der Kunde wird benachrichtigt.',
                [
                  { text: 'Abbrechen', style: 'cancel' },
                  { text: 'Bestätigen', onPress: () => completeMutation.mutate() },
                ],
              )
            }
            loading={completeMutation.isPending}
            style={styles.actionBtn}
          />
        )}

        {order.status === 'RELEASED' && (
          <Button
            label="Auftraggeber bewerten"
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
            <Text style={styles.chatLinkText}>💬 Chat mit {customerFirstName} öffnen</Text>
          </TouchableOpacity>
        )}

        {/* Amounts breakdown */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Zahlungsdetails</Text>
          <AmountRow label="Angebotspreis" value={`${order.totalAmount.toFixed(2)} €`} />
          <AmountRow label="Plattformgebühr" value={`- ${order.platformFee.toFixed(2)} €`} />
          <View style={styles.divider} />
          <AmountRow label="Netto-Auszahlung" value={`${order.providerAmount.toFixed(2)} €`} bold />
        </Card>
      </ScrollView>

      {/* Rating modal */}
      <Modal visible={showRatingModal} animationType="slide" transparent onRequestClose={() => setShowRatingModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Auftraggeber bewerten</Text>
            <Text style={styles.modalSubtitle}>{customerFirstName} bewerten</Text>
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
                label="Senden"
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
      <Text style={[amountStyles.value, bold ? amountStyles.boldVal : null]}>{value}</Text>
    </View>
  )
}

const amountStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs + 2 },
  label: { fontSize: fontSize.sm, color: colors.textSecondary },
  value: { fontSize: fontSize.sm, color: colors.text },
  bold: { fontWeight: fontWeight.bold, color: colors.text },
  boldVal: { fontWeight: fontWeight.bold, fontSize: fontSize.md, color: colors.secondary },
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
  earningsCard: { backgroundColor: colors.secondaryLight, borderColor: colors.secondary, alignItems: 'center', paddingVertical: spacing.lg },
  earningsLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.secondary, marginBottom: spacing.xs },
  earningsAmount: { fontSize: 40, fontWeight: fontWeight.bold, color: colors.secondary, letterSpacing: -1 },
  earningsNote: { fontSize: fontSize.xs, color: colors.secondary, marginTop: spacing.xs, opacity: 0.8 },
  sectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  serviceTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.xs },
  serviceDesc: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.xs },
  location: { fontSize: fontSize.sm, color: colors.textSecondary },
  countdownCard: { backgroundColor: colors.warningLight, borderColor: colors.warning },
  countdownTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  countdownText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  countdownHours: { fontWeight: fontWeight.bold, color: colors.warning },
  disputeCard: { backgroundColor: colors.errorLight, borderColor: colors.error },
  disputeTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.error, marginBottom: spacing.xs },
  disputeText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  actionBtn: { marginBottom: spacing.sm },
  chatLink: { marginTop: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', marginBottom: spacing.md },
  chatLinkText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.medium },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  modalSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },
  starsCenter: { alignItems: 'center', marginVertical: spacing.lg },
  ratingInput: { backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.md, color: colors.text, height: 80, marginBottom: spacing.lg },
  modalActions: { flexDirection: 'row', gap: spacing.md },
  modalBtn: { flex: 1 },
})
