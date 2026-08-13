import React, { useState, useRef, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { requestChatApi } from '../../../src/api/requestChat.api'
import {
  negotiationApi,
  type NegotiationMessage,
  type NegotiationOffer,
} from '../../../src/api/negotiation.api'
import { getApiErrorMessage } from '../../../src/api/client'
import { OfferCard } from '../../../src/components/chat/OfferCard'
import { OfferComposer, type OfferDraft } from '../../../src/components/chat/OfferComposer'
import { ConfirmModal } from '../../../src/components/ui/ConfirmModal'
import { AnimatedEntrance } from '../../../src/components/ui/motion'
import { useAuthStore } from '../../../src/store/auth.store'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'

export default function RequestChatScreen() {
  const { requestId, providerId: providerIdParam, title, otherPartyName } = useLocalSearchParams<{
    requestId: string
    providerId?: string
    title?: string
    otherPartyName?: string
  }>()
  const router = useRouter()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [text, setText] = useState('')
  const [resolvedProviderId, setResolvedProviderId] = useState<string | null>(providerIdParam ?? null)
  const flatListRef = useRef<FlatList>(null)

  // Offer composer state
  const [composerOpen, setComposerOpen] = useState(false)
  const [counterTarget, setCounterTarget] = useState<NegotiationOffer | null>(null)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [confirmAccept, setConfirmAccept] = useState<NegotiationOffer | null>(null)
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null)

  const scrollToEnd = useCallback((animated = true) => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated }), 80)
  }, [])

  // The provider's own thread is created lazily, so when no providerId was
  // passed we first resolve it, then drive everything off the negotiation
  // endpoint (which returns messages *and* live offer state together).
  const { data: bootstrapProviderId } = useQuery({
    queryKey: ['request-chat-bootstrap', requestId],
    queryFn: async () => {
      const res = await requestChatApi.openMine(requestId)
      setResolvedProviderId(res.data.chat.providerId)
      return res.data.chat.providerId
    },
    enabled: !!requestId && !providerIdParam,
  })

  const providerId = providerIdParam ?? resolvedProviderId ?? bootstrapProviderId ?? null

  const negotiationKey = ['negotiation', requestId, providerId] as const

  const { data: negotiation, isLoading } = useQuery({
    queryKey: negotiationKey,
    queryFn: () => negotiationApi.get(requestId, providerId!).then((r) => r.data),
    enabled: !!requestId && !!providerId,
    refetchInterval: 4000,
  })

  const refresh = () => qc.invalidateQueries({ queryKey: negotiationKey })

  const sendMutation = useMutation({
    mutationFn: (content: string) => requestChatApi.sendMessage(requestId, providerId!, content),
    onSuccess: () => {
      setText('')
      refresh()
      scrollToEnd()
    },
  })

  const proposeMutation = useMutation({
    mutationFn: (draft: OfferDraft) =>
      negotiationApi.propose({
        requestId,
        providerId: providerId!,
        ...draft,
        parentOfferId: counterTarget?.id,
      }),
    onSuccess: () => {
      setComposerOpen(false)
      setCounterTarget(null)
      setComposerError(null)
      refresh()
      scrollToEnd()
    },
    onError: (err) => setComposerError(getApiErrorMessage(err)),
  })

  const acceptMutation = useMutation({
    mutationFn: (offerId: string) => negotiationApi.accept(offerId),
    onSuccess: (res) => {
      setConfirmAccept(null)
      setBusyOfferId(null)
      qc.invalidateQueries({ queryKey: ['my-requests'] })
      qc.invalidateQueries({ queryKey: ['customer-orders'] })
      refresh()
      router.push(`/(customer)/orders/${res.data.order.id}`)
    },
    onError: (err) => {
      setBusyOfferId(null)
      setConfirmAccept(null)
      Alert.alert('Annehmen fehlgeschlagen', getApiErrorMessage(err))
    },
  })

  const declineMutation = useMutation({
    mutationFn: (offerId: string) => negotiationApi.decline(offerId),
    onSuccess: () => { setBusyOfferId(null); refresh() },
    onError: (err) => { setBusyOfferId(null); Alert.alert('Fehler', getApiErrorMessage(err)) },
  })

  const withdrawMutation = useMutation({
    mutationFn: (offerId: string) => negotiationApi.withdraw(offerId),
    onSuccess: () => { setBusyOfferId(null); refresh() },
    onError: (err) => { setBusyOfferId(null); Alert.alert('Fehler', getApiErrorMessage(err)) },
  })

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || !providerId || sendMutation.isPending) return
    sendMutation.mutate(trimmed)
  }

  const messages = negotiation?.messages ?? []
  const viewerIsCustomer = negotiation?.viewerIsCustomer ?? false
  const activeOffer = negotiation?.activeOffer ?? null

  // Only one live offer at a time — while one is open the composer becomes
  // "counter" instead of a second parallel proposal.
  const canProposeFresh = !activeOffer

  const headerTitle = otherPartyName ?? title ?? 'Anfrage-Chat'
  const headerSub = useMemo(() => {
    if (activeOffer) return `Offenes Angebot: ${activeOffer.proposedPrice.toFixed(2)} €`
    return viewerIsCustomer ? 'Verhandlung' : 'Anfrage vor Angebot'
  }, [activeOffer, viewerIsCustomer])

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{headerSub}</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatEmoji}>💬</Text>
                <Text style={styles.emptyChatTitle}>Noch keine Nachrichten</Text>
                <Text style={styles.emptyChatText}>
                  Klärt offene Fragen und verhandelt den Preis direkt hier im Chat.
                </Text>
              </View>
            }
            renderItem={({ item, index }) => (
              <AnimatedEntrance index={Math.min(index, 3)}>
              <ChatRow
                message={item}
                isOwn={item.senderId === user?.id}
                currentUserId={user?.id}
                viewerIsCustomer={viewerIsCustomer}
                busyOfferId={busyOfferId}
                onAccept={(offer) => setConfirmAccept(offer)}
                onDecline={(offer) => { setBusyOfferId(offer.id); declineMutation.mutate(offer.id) }}
                onWithdraw={(offer) => { setBusyOfferId(offer.id); withdrawMutation.mutate(offer.id) }}
                onCounter={(offer) => {
                  setCounterTarget(offer)
                  setComposerError(null)
                  setComposerOpen(true)
                }}
              />
              </AnimatedEntrance>
            )}
          />
        )}

        <View style={styles.composerBar}>
          <TouchableOpacity
            onPress={() => {
              setCounterTarget(activeOffer ?? null)
              setComposerError(null)
              setComposerOpen(true)
            }}
            disabled={!providerId}
            style={styles.offerBtn}
          >
            <Text style={styles.offerBtnText}>
              {canProposeFresh ? '＋ Angebot' : '🔁 Gegenangebot'}
            </Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Nachricht schreiben..."
            placeholderTextColor={colors.textDisabled}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim() || sendMutation.isPending || !providerId}
            style={[styles.sendBtn, (!text.trim() || !providerId) ? styles.sendBtnDisabled : null]}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={styles.sendIcon}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <OfferComposer
        visible={composerOpen}
        isCounter={!!counterTarget}
        counteringPrice={counterTarget?.proposedPrice}
        counteringScope={counterTarget?.scopeOfWork}
        submitting={proposeMutation.isPending}
        error={composerError}
        onSubmit={(draft) => proposeMutation.mutate(draft)}
        onCancel={() => {
          setComposerOpen(false)
          setCounterTarget(null)
          setComposerError(null)
        }}
      />

      <ConfirmModal
        visible={!!confirmAccept}
        title="Angebot annehmen?"
        message={
          confirmAccept
            ? `Du nimmst das Angebot über ${confirmAccept.proposedPrice.toFixed(2)} € an. Der Betrag wird sicher auf einem Treuhandkonto gehalten und erst nach deiner Freigabe ausgezahlt.`
            : ''
        }
        confirmLabel="Jetzt annehmen"
        loading={acceptMutation.isPending}
        onConfirm={() => {
          if (!confirmAccept) return
          setBusyOfferId(confirmAccept.id)
          acceptMutation.mutate(confirmAccept.id)
        }}
        onCancel={() => setConfirmAccept(null)}
      />
    </SafeAreaView>
  )
}

function ChatRow({
  message,
  isOwn,
  currentUserId,
  viewerIsCustomer,
  busyOfferId,
  onAccept,
  onDecline,
  onCounter,
  onWithdraw,
}: {
  message: NegotiationMessage
  isOwn: boolean
  currentUserId?: string
  viewerIsCustomer: boolean
  busyOfferId: string | null
  onAccept: (offer: NegotiationOffer) => void
  onDecline: (offer: NegotiationOffer) => void
  onCounter: (offer: NegotiationOffer) => void
  onWithdraw: (offer: NegotiationOffer) => void
}) {
  if (message.messageType === 'OFFER' && message.offer) {
    const offer = message.offer
    return (
      <OfferCard
        offer={offer}
        isOwn={offer.proposedByUserId === currentUserId}
        // Accepting creates the escrow order, which only the customer can do.
        canAccept={viewerIsCustomer}
        busy={busyOfferId === offer.id}
        onAccept={() => onAccept(offer)}
        onDecline={() => onDecline(offer)}
        onCounter={() => onCounter(offer)}
        onWithdraw={() => onWithdraw(offer)}
      />
    )
  }

  if (message.isSystem || message.messageType === 'SYSTEM') {
    return (
      <View style={bubbleStyles.systemRow}>
        <Text style={bubbleStyles.systemText}>{message.content}</Text>
      </View>
    )
  }

  return (
    <View style={[bubbleStyles.row, isOwn ? bubbleStyles.rowOwn : null]}>
      <View style={[bubbleStyles.bubble, isOwn ? bubbleStyles.bubbleOwn : bubbleStyles.bubbleOther]}>
        <Text style={[bubbleStyles.text, isOwn ? bubbleStyles.textOwn : null]}>{message.content}</Text>
        <Text style={[bubbleStyles.time, isOwn ? bubbleStyles.timeOwn : null]}>
          {new Date(message.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  )
}

const bubbleStyles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: spacing.sm },
  rowOwn: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', padding: spacing.sm + 2, borderRadius: radius.lg, borderBottomLeftRadius: 4 },
  bubbleOwn: { backgroundColor: colors.primary, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  text: { fontSize: fontSize.md, lineHeight: 22, color: colors.text },
  textOwn: { color: colors.textInverse },
  time: { fontSize: 11, color: colors.textSecondary, marginTop: 4, alignSelf: 'flex-end' },
  timeOwn: { color: 'rgba(255,255,255,0.7)' },
  systemRow: { alignItems: 'center', marginVertical: spacing.sm },
  systemText: {
    fontSize: fontSize.xs, color: colors.textSecondary, backgroundColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, textAlign: 'center',
  },
})

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm },
  backText: { fontSize: 28, color: colors.primary, lineHeight: 28 },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  headerSub: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  kav: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageList: { padding: spacing.md, flexGrow: 1 },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyChatEmoji: { fontSize: 44, marginBottom: spacing.sm },
  emptyChatTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs, textAlign: 'center' },
  emptyChatText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  composerBar: {
    flexDirection: 'row', alignItems: 'flex-end', padding: spacing.md, paddingTop: spacing.sm,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm,
  },
  offerBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  offerBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  input: {
    flex: 1, maxHeight: 110, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.md, color: colors.text,
    backgroundColor: colors.background,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.textDisabled },
  sendIcon: { fontSize: 22, color: colors.textInverse, fontWeight: fontWeight.bold },
})
