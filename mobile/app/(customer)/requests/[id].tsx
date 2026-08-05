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
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { requestsApi } from '../../../src/api/requests.api'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { Button } from '../../../src/components/ui/Button'
import { StarRating } from '../../../src/components/ui/StarRating'
import { ConfirmModal } from '../../../src/components/ui/ConfirmModal'
import { getApiErrorMessage } from '../../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius, shadow } from '../../../src/constants/theme'
import { formatEur } from '../../../src/utils/currency'
import type { Offer } from '../../../src/api/types'
import { formatDate } from '../../../src/utils/date'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Entwurf',
  OPEN: 'Offen',
  OFFER_RECEIVED: 'Angebote erhalten',
  AWAITING_PAYMENT: 'Zahlung ausstehend',
  IN_PROGRESS: 'In Bearbeitung',
  COMPLETED_BY_PROVIDER: 'Abgeschlossen',
  AWAITING_RELEASE: 'Freigabe ausstehend',
  RELEASED: 'Abgerechnet',
  DISPUTED: 'Streitfall',
  CANCELLED: 'Abgebrochen',
}

const STATUS_COLOR: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  DRAFT: 'neutral',
  OPEN: 'primary',
  OFFER_RECEIVED: 'warning',
  AWAITING_PAYMENT: 'warning',
  IN_PROGRESS: 'primary',
  COMPLETED_BY_PROVIDER: 'success',
  AWAITING_RELEASE: 'warning',
  RELEASED: 'success',
  DISPUTED: 'error',
  CANCELLED: 'neutral',
}

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Offer | null>(null)
  const [counterTarget, setCounterTarget] = useState<Offer | null>(null)
  const [counterPrice, setCounterPrice] = useState('')
  const [counterMessage, setCounterMessage] = useState('')
  const [counterError, setCounterError] = useState('')

  const { data: request, isLoading } = useQuery({
    queryKey: ['request', id],
    queryFn: () => requestsApi.get(id).then((r) => r.data.request),
    enabled: !!id,
  })

  const { data: offers, isLoading: offersLoading } = useQuery({
    queryKey: ['request-offers', id],
    queryFn: () => requestsApi.getOffers(id).then((r) => r.data.offers),
    enabled: !!id && ['OPEN', 'OFFER_RECEIVED', 'AWAITING_PAYMENT'].includes(request?.status ?? ''),
  })

  const publishMutation = useMutation({
    mutationFn: () => requestsApi.publish(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['request', id] }),
    onError: (err) => setAcceptError(getApiErrorMessage(err)),
  })

  const cancelMutation = useMutation({
    mutationFn: () => requestsApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-requests'] })
      router.back()
    },
    onError: (err) => setAcceptError(getApiErrorMessage(err)),
  })

  const acceptMutation = useMutation({
    mutationFn: (offerId: string) => requestsApi.acceptOffer(offerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-requests'] })
      qc.invalidateQueries({ queryKey: ['customer-orders'] })
      setSelectedOffer(null)
      setAcceptError(null)
      router.replace('/(customer)/orders')
    },
    onError: (err) => setAcceptError(getApiErrorMessage(err)),
  })

  const rejectMutation = useMutation({
    mutationFn: (offerId: string) => requestsApi.rejectOffer(offerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['request-offers', id] })
      qc.invalidateQueries({ queryKey: ['request', id] })
      setRejectTarget(null)
    },
    onError: (err) => {
      Alert.alert('Fehler', getApiErrorMessage(err))
      setRejectTarget(null)
    },
  })

  const counterMutation = useMutation({
    mutationFn: () => requestsApi.counterOffer(counterTarget!.id, Number(counterPrice), counterMessage.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['request-offers', id] })
      qc.invalidateQueries({ queryKey: ['request', id] })
      setCounterTarget(null)
      setCounterPrice('')
      setCounterMessage('')
      setCounterError('')
    },
    onError: (err) => setCounterError(getApiErrorMessage(err)),
  })

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (!request) return null

  const canPublish = request.status === 'DRAFT'
  const canCancel = ['DRAFT', 'OPEN'].includes(request.status)
  const canAcceptOffer = ['OPEN', 'OFFER_RECEIVED'].includes(request.status)
  const showOffers = ['OPEN', 'OFFER_RECEIVED', 'AWAITING_PAYMENT'].includes(request.status)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Zurück</Text>
          </TouchableOpacity>
          <Badge
            label={STATUS_LABEL[request.status] ?? request.status}
            color={STATUS_COLOR[request.status] ?? 'neutral'}
          />
        </View>

        <Text style={styles.title}>{request.title}</Text>

        {/* Meta info */}
        <View style={styles.metaRow}>
          <MetaChip icon="📁" text={request.category?.name ?? 'Kategorie'} />
          <MetaChip icon="📍" text={`${request.addressCity ?? request.city ?? ''} ${request.plz}`} />
          {(request.budgetMin ?? request.budget) ? <MetaChip icon="💶" text={`bis ${(request.budgetMin ?? request.budget)!.toFixed(0)} €`} /> : null}
          {(request.preferredDateStart ?? request.scheduledAt) ? (
            <MetaChip icon="📅" text={formatDate((request.preferredDateStart ?? request.scheduledAt)!)} />
          ) : null}
        </View>

        {/* Description */}
        <Card style={styles.descCard}>
          <Text style={styles.sectionLabel}>Beschreibung</Text>
          <Text style={styles.description}>{request.description}</Text>
        </Card>

        {/* Actions */}
        {canPublish && (
          <Button
            label="Auftrag veröffentlichen"
            onPress={() =>
              Alert.alert('Veröffentlichen', 'Möchtest du diesen Auftrag jetzt veröffentlichen?', [
                { text: 'Abbrechen', style: 'cancel' },
                { text: 'Veröffentlichen', onPress: () => publishMutation.mutate() },
              ])
            }
            loading={publishMutation.isPending}
            style={styles.actionBtn}
          />
        )}
        {canCancel && (
          <Button
            label="Auftrag stornieren"
            variant="danger"
            onPress={() =>
              Alert.alert('Stornieren', 'Möchtest du diesen Auftrag wirklich stornieren?', [
                { text: 'Abbrechen', style: 'cancel' },
                { text: 'Stornieren', style: 'destructive', onPress: () => cancelMutation.mutate() },
              ])
            }
            loading={cancelMutation.isPending}
            style={styles.actionBtn}
          />
        )}

        {/* Offers section */}
        {showOffers && (
          <View>
            <Text style={styles.sectionTitle}>
              Angebote {offers?.length ? `(${offers.length})` : ''}
            </Text>
            {offersLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
            ) : offers?.length === 0 ? (
              <Card style={styles.emptyOffers}>
                <Text style={styles.emptyOffersText}>
                  Noch keine Angebote. Dienstleister in deiner Region können dir Angebote schicken.
                </Text>
              </Card>
            ) : (
              offers?.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  canAccept={canAcceptOffer && offer.status === 'PENDING'}
                  onAccept={() => setSelectedOffer(offer)}
                  onReject={() => setRejectTarget(offer)}
                  onCounter={() => {
                    setCounterTarget(offer)
                    setCounterPrice(String(offer.proposedPrice ?? offer.price ?? ''))
                    setCounterMessage('')
                    setCounterError('')
                  }}
                />
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Accept offer confirmation sheet */}
      <Modal
        visible={!!selectedOffer}
        animationType="slide"
        transparent
        onRequestClose={() => { setSelectedOffer(null); setAcceptError(null) }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Angebot annehmen</Text>
            {selectedOffer && (
              <>
                <View style={styles.offerSummary}>
                  <Text style={styles.offerSummaryLabel}>Preis</Text>
                  <Text style={styles.offerSummaryPrice}>{formatEur(selectedOffer.proposedPrice ?? selectedOffer.price ?? 0)}</Text>
                </View>
                <Text style={styles.offerSummaryMsg} numberOfLines={4}>
                  {selectedOffer.scopeOfWork ?? selectedOffer.message ?? ''}
                </Text>
                <Card style={styles.escrowInfo}>
                  <Text style={styles.escrowText}>
                    🔒 Dein Geld wird sicher auf einem Treuhandkonto gehalten und erst nach deiner Freigabe an den Dienstleister ausgezahlt.
                  </Text>
                </Card>
                {acceptError ? (
                  <Text style={styles.errorText}>{acceptError}</Text>
                ) : null}
                <View style={styles.modalActions}>
                  <Button
                    label="Abbrechen"
                    variant="outline"
                    onPress={() => { setSelectedOffer(null); setAcceptError(null) }}
                    fullWidth={false}
                    style={styles.modalBtn}
                  />
                  <Button
                    label="Jetzt annehmen"
                    onPress={() => acceptMutation.mutate(selectedOffer.id)}
                    loading={acceptMutation.isPending}
                    fullWidth={false}
                    style={styles.modalBtn}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Reject offer confirmation */}
      <ConfirmModal
        visible={!!rejectTarget}
        title="Angebot ablehnen?"
        message={`Das Angebot von ${rejectTarget?.provider?.user?.displayName ?? 'diesem Dienstleister'} wird abgelehnt.`}
        confirmLabel="Ablehnen"
        destructive
        loading={rejectMutation.isPending}
        onConfirm={() => rejectMutation.mutate(rejectTarget!.id)}
        onCancel={() => setRejectTarget(null)}
      />

      {/* Counter-offer sheet */}
      <Modal
        visible={!!counterTarget}
        animationType="slide"
        transparent
        onRequestClose={() => { setCounterTarget(null); setCounterError('') }}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Gegenangebot senden</Text>
            <Text style={styles.offerSummaryMsg}>
              Das aktuelle Angebot wird abgelehnt und der Dienstleister wird eingeladen, ein neues Angebot zu deinem Preisvorschlag abzugeben.
            </Text>

            <Text style={styles.fieldLabel}>Dein Preisvorschlag (€)</Text>
            <TextInput
              style={styles.counterInput}
              value={counterPrice}
              onChangeText={setCounterPrice}
              keyboardType="decimal-pad"
              placeholder="z.B. 180"
              placeholderTextColor={colors.textDisabled}
            />

            <Text style={styles.fieldLabel}>Nachricht (optional)</Text>
            <TextInput
              style={[styles.counterInput, styles.counterMessageInput]}
              value={counterMessage}
              onChangeText={setCounterMessage}
              placeholder="z.B. Könnten Sie das für 180€ machen?"
              placeholderTextColor={colors.textDisabled}
              multiline
            />

            {counterError ? <Text style={styles.errorText}>{counterError}</Text> : null}

            <View style={styles.modalActions}>
              <Button
                label="Abbrechen"
                variant="outline"
                onPress={() => { setCounterTarget(null); setCounterError('') }}
                fullWidth={false}
                style={styles.modalBtn}
              />
              <Button
                label="Senden"
                onPress={() => {
                  const price = Number(counterPrice)
                  if (!price || price <= 0) { setCounterError('Bitte gib einen gültigen Preis ein.'); return }
                  setCounterError('')
                  counterMutation.mutate()
                }}
                loading={counterMutation.isPending}
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

function OfferCard({
  offer,
  canAccept,
  onAccept,
  onReject,
  onCounter,
}: {
  offer: Offer
  canAccept: boolean
  onAccept: () => void
  onReject: () => void
  onCounter: () => void
}) {
  const provider = offer.provider
  const name = provider?.user?.displayName ?? 'Dienstleister'
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <Card style={offerStyles.card}>
      <View style={offerStyles.top}>
        <View style={offerStyles.avatar}>
          <Text style={offerStyles.avatarText}>{initials || '?'}</Text>
        </View>
        <View style={offerStyles.providerInfo}>
          <Text style={offerStyles.providerName}>{name}</Text>
          <View style={offerStyles.ratingRow}>
            <StarRating value={provider?.averageRating ?? 0} size={14} />
            <Text style={offerStyles.ratingCount}>
              {provider?.averageRating?.toFixed(1) ?? '–'} ({provider?.totalReviews ?? 0})
            </Text>
          </View>
        </View>
        <Text style={offerStyles.price}>{formatEur(offer.proposedPrice ?? offer.price ?? 0)}</Text>
      </View>

      <Text style={offerStyles.message} numberOfLines={4}>{offer.message}</Text>

      <Text style={offerStyles.validity}>
        Gültig bis {formatDate(offer.validUntil)}
      </Text>

      {canAccept && (
        <View style={offerStyles.actions}>
          <TouchableOpacity onPress={onReject} style={[offerStyles.actionBtn, offerStyles.rejectBtn]}>
            <Text style={offerStyles.rejectBtnText}>Ablehnen</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onCounter} style={[offerStyles.actionBtn, offerStyles.counterBtn]}>
            <Text style={offerStyles.counterBtnText}>Gegenangebot</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onAccept} style={[offerStyles.actionBtn, offerStyles.acceptBtn]}>
            <Text style={offerStyles.acceptBtnText}>Annehmen ✓</Text>
          </TouchableOpacity>
        </View>
      )}
    </Card>
  )
}

function MetaChip({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={metaStyles.chip}>
      <Text style={metaStyles.icon}>{icon}</Text>
      <Text style={metaStyles.text}>{text}</Text>
    </View>
  )
}

const metaStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  icon: { fontSize: 14 },
  text: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: fontWeight.medium },
})

const offerStyles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.primary },
  providerInfo: { flex: 1 },
  providerName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  ratingCount: { fontSize: fontSize.xs, color: colors.textSecondary },
  price: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.secondary },
  message: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.sm },
  validity: { fontSize: fontSize.xs, color: colors.textDisabled, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.xs },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
  },
  rejectBtn: { borderWidth: 1, borderColor: colors.border },
  rejectBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  counterBtn: { borderWidth: 1, borderColor: colors.primary },
  counterBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  acceptBtn: { backgroundColor: colors.primary },
  acceptBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textInverse },
})

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  backBtn: {},
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: fontWeight.medium },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md, lineHeight: 28 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  descCard: { marginBottom: spacing.md },
  sectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  description: { fontSize: fontSize.md, color: colors.text, lineHeight: 24 },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md, marginTop: spacing.lg },
  actionBtn: { marginBottom: spacing.sm },
  emptyOffers: { marginBottom: spacing.md },
  emptyOffersText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, textAlign: 'center' },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.lg },
  offerSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  offerSummaryLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  offerSummaryPrice: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.secondary },
  offerSummaryMsg: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.md },
  fieldLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs, marginTop: spacing.sm },
  counterInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, fontSize: fontSize.md, color: colors.text },
  counterMessageInput: { minHeight: 70, textAlignVertical: 'top' },
  escrowInfo: { backgroundColor: colors.primaryLight, borderColor: colors.primary, marginBottom: spacing.lg },
  escrowText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  modalActions: { flexDirection: 'row', gap: spacing.md },
  modalBtn: { flex: 1 },
  errorText: { fontSize: fontSize.sm, color: colors.error, backgroundColor: '#fee2e2', padding: spacing.sm, borderRadius: 6, marginBottom: spacing.sm },
})
