import React, { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { requestsApi } from '../../src/api/requests.api'
import { ordersApi } from '../../src/api/orders.api'
import { Card } from '../../src/components/ui/Card'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { Input } from '../../src/components/ui/Input'
import { NotificationBell } from '../../src/components/ui/NotificationBell'
import { StarRating } from '../../src/components/ui/StarRating'
import { useAuthStore } from '../../src/store/auth.store'
import { getApiErrorMessage } from '../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'
import type { ServiceRequest, Order } from '../../src/api/types'
import { formatDate } from '../../src/utils/date'
import { formatEur } from '../../src/utils/currency'
import { isActiveOrderStatus } from '../../src/constants/orderStatus'

export default function ProviderFeedScreen() {
  const { user } = useAuthStore()
  const router = useRouter()
  const qc = useQueryClient()
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null)
  const [offerPrice, setOfferPrice] = useState('')
  const [offerMessage, setOfferMessage] = useState('')
  const [offerError, setOfferError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['provider-feed'],
    queryFn: () => requestsApi.providerFeed({ limit: 30 }).then((r) => r.data),
  })

  const { data: myOrdersData, isLoading: activeOrdersLoading } = useQuery({
    queryKey: ['provider-orders-recent'],
    queryFn: () => ordersApi.list({ limit: 20, perspective: 'provider' }).then((r) => {
      const raw = r.data as unknown as { orders?: Order[] }
      return raw.orders ?? []
    }),
  })
  const activeOrders = (myOrdersData ?? []).filter((o) => isActiveOrderStatus(o.status)).slice(0, 3)

  const offerMutation = useMutation({
    mutationFn: () => {
      if (!selectedRequest) throw new Error('Kein Auftrag ausgewählt')
      const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      return requestsApi.createOffer({
        requestId: selectedRequest.id,
        price: parseFloat(offerPrice),
        message: offerMessage.trim(),
        validUntil,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-feed'] })
      qc.invalidateQueries({ queryKey: ['my-offers'] })
      setSelectedRequest(null)
      setOfferPrice('')
      setOfferMessage('')
      setOfferError(null)
      setSuccessMsg('Angebot erfolgreich eingereicht! Der Kunde wird benachrichtigt.')
      setTimeout(() => setSuccessMsg(null), 4000)
    },
    onError: (err) => setOfferError(getApiErrorMessage(err)),
  })

  const requests = data?.items ?? []

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.greeting} numberOfLines={1}>Hallo, {user?.displayName} 👋</Text>
        <Text style={styles.sub}>Willkommen zurück</Text>
        <View style={styles.headerActions}>
          <NotificationBell />
          <TouchableOpacity onPress={() => router.push('/(provider)/listings')} style={styles.myRequestsBtn}>
            <Text style={styles.myRequestsBtnText} numberOfLines={1}>Inserate</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(provider)/requests')} style={styles.myRequestsBtn}>
            <Text style={styles.myRequestsBtnText} numberOfLines={1}>Anfragen</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/requests/create')} style={styles.postBtn}>
            <Text style={styles.postBtnText} numberOfLines={1}>+ Auftrag</Text>
          </TouchableOpacity>
        </View>
      </View>

      {successMsg ? (
        <View style={styles.successBanner}>
          <Text style={styles.successBannerText}>✓ {successMsg}</Text>
        </View>
      ) : null}

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListHeaderComponent={
          <View style={styles.activeSection}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Deine aktiven Aufträge</Text>
              <TouchableOpacity onPress={() => router.push('/(provider)/orders')}>
                <Text style={styles.seeAll}>Alle anzeigen →</Text>
              </TouchableOpacity>
            </View>
            {activeOrdersLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
            ) : activeOrders.length === 0 ? (
              <View style={styles.activeEmpty}>
                <Text style={styles.activeEmptyEmoji}>🔧</Text>
                <Text style={styles.activeEmptyTitle}>Keine aktiven Aufträge</Text>
                <Text style={styles.activeEmptyText}>
                  Sobald du ein Angebot gewinnst, erscheint der Auftrag hier.
                </Text>
              </View>
            ) : (
              activeOrders.map((order) => (
                <ActiveOrderCard key={order.id} order={order} onPress={() => router.push(`/(provider)/orders/${order.id}`)} />
              ))
            )}
            <Text style={[styles.sectionTitle, styles.feedTitle]}>Neue Aufträge in deiner Region</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📌</Text>
              <Text style={styles.emptyTitle}>Keine offenen Aufträge</Text>
              <Text style={styles.emptyText}>
                Aktuell gibt es keine Aufträge in deiner Region. Schau später wieder vorbei.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <FeedCard
            request={item}
            onOffer={() => setSelectedRequest(item)}
            onChat={() =>
              router.push({
                pathname: '/chat/request/[requestId]',
                params: { requestId: item.id, title: item.title },
              })
            }
            onCustomerPress={() => {
              if (item.customer?.id) router.push(`/customers/${item.customer.id}`)
            }}
          />
        )}
      />

      {/* Offer Modal */}
      <Modal
        visible={!!selectedRequest}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedRequest(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Angebot erstellen</Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {selectedRequest?.title}
            </Text>

            <Input
              label="Dein Preis (€) *"
              value={offerPrice}
              onChangeText={setOfferPrice}
              keyboardType="decimal-pad"
              placeholder="z.B. 120.00"
              rightIcon={<Text style={styles.euroSign}>€</Text>}
            />
            <Input
              label="Nachricht an den Kunden *"
              value={offerMessage}
              onChangeText={setOfferMessage}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={styles.msgInput}
              placeholder="Beschreibe kurz deine Qualifikation und warum du der Richtige bist..."
            />

            {offerError ? <Text style={styles.offerErrorText}>{offerError}</Text> : null}

            <View style={styles.modalActions}>
              <Button
                label="Abbrechen"
                variant="outline"
                onPress={() => { setSelectedRequest(null); setOfferError(null) }}
                fullWidth={false}
                style={styles.modalBtn}
              />
              <Button
                label="Angebot senden"
                onPress={() => {
                  if (!offerPrice || parseFloat(offerPrice) <= 0) {
                    setOfferError('Bitte gib einen gültigen Preis ein.')
                    return
                  }
                  if (!offerMessage.trim() || offerMessage.trim().length < 10) {
                    setOfferError('Nachricht muss mindestens 10 Zeichen haben.')
                    return
                  }
                  setOfferError(null)
                  offerMutation.mutate()
                }}
                loading={offerMutation.isPending}
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

function FeedCard({
  request,
  onOffer,
  onChat,
  onCustomerPress,
}: {
  request: ServiceRequest & { myOffer?: { id: string; status: string; proposedPrice: number } | null }
  onOffer: () => void
  onChat: () => void
  onCustomerPress: () => void
}) {
  // A rejected/withdrawn/expired offer shouldn't block a fresh one — e.g. after
  // the customer sends a counter-offer, the provider needs to be able to submit
  // a new price rather than being stuck behind their old offer's static badge.
  const alreadyOffered = request.myOffer?.status === 'PENDING' || request.myOffer?.status === 'ACCEPTED'
  const customerName = request.customer?.user?.displayName
  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardMeta}>
          <Text style={styles.category}>{request.category?.name ?? 'Sonstiges'}</Text>
          <Text style={styles.location}>📍 {request.addressCity ?? request.city ?? ''} {request.plz}</Text>
        </View>
        {(request.budgetMin ?? request.budget) ? (
          <Text style={styles.budget}>bis {(request.budgetMin ?? request.budget)!.toFixed(0)} €</Text>
        ) : null}
      </View>
      {customerName ? (
        <TouchableOpacity onPress={onCustomerPress} style={styles.customerRow} activeOpacity={0.7}>
          <Text style={styles.customerName}>{customerName}</Text>
          <StarRating value={request.customer?.averageRating ?? 0} size={12} />
          <Text style={styles.customerRatingCount}>
            ({request.customer?.totalReviews ?? 0})
          </Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.cardTitle} numberOfLines={2}>{request.title}</Text>
      <Text style={styles.cardDesc} numberOfLines={3}>{request.description}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.postedAt}>
          {formatDate(request.createdAt)}
        </Text>
        <View style={styles.footerActions}>
          <TouchableOpacity onPress={onChat} style={styles.chatBtn}>
            <Text style={styles.chatBtnText}>💬 Chat</Text>
          </TouchableOpacity>
          {alreadyOffered ? (
            <View style={styles.offeredBadge}>
              <Text style={styles.offeredBadgeText}>✓ Angeboten · {request.myOffer!.proposedPrice.toFixed(0)} €</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={onOffer} style={styles.offerBtn}>
              <Text style={styles.offerBtnText}>Angebot abgeben</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Card>
  )
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Zahlung ausstehend',
  IN_PROGRESS: 'In Bearbeitung',
  COMPLETED_BY_PROVIDER: 'Abgezeichnet',
  AWAITING_RELEASE: 'Freigabe ausstehend',
  DISPUTED: 'Streitfall',
}

const ORDER_STATUS_COLOR: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  AWAITING_PAYMENT: 'warning',
  IN_PROGRESS: 'primary',
  COMPLETED_BY_PROVIDER: 'success',
  AWAITING_RELEASE: 'warning',
  DISPUTED: 'error',
}

function ActiveOrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const title = order.request?.title ?? 'Auftrag'
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Card style={activeOrderStyles.card}>
        <View style={activeOrderStyles.row}>
          <Text style={activeOrderStyles.title} numberOfLines={1}>{title}</Text>
          <Badge label={ORDER_STATUS_LABEL[order.status] ?? order.status} color={ORDER_STATUS_COLOR[order.status] ?? 'neutral'} />
        </View>
        <Text style={activeOrderStyles.amount}>
          {formatEur(order.netProviderAmount ?? order.providerAmount ?? 0)}
        </Text>
      </Card>
    </TouchableOpacity>
  )
}

const activeOrderStyles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  title: { flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginRight: spacing.sm },
  amount: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.secondary },
})

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  greeting: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  sub: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center', marginTop: spacing.md },
  myRequestsBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.primary },
  myRequestsBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  postBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  postBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textInverse },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  activeSection: { marginBottom: spacing.md },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  feedTitle: { marginTop: spacing.md, marginBottom: spacing.sm },
  seeAll: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold },
  activeEmpty: {
    alignItems: 'center', paddingVertical: spacing.lg, paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  activeEmptyEmoji: { fontSize: 32, marginBottom: spacing.sm },
  activeEmptyTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs, textAlign: 'center' },
  activeEmptyText: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  card: { marginBottom: spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs },
  cardMeta: { flex: 1 },
  category: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  location: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  budget: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.secondary },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  customerName: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.text },
  customerRatingCount: { fontSize: fontSize.xs, color: colors.textSecondary },
  cardTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs, lineHeight: 22 },
  cardDesc: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.md },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chatBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  chatBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.text },
  postedAt: { fontSize: fontSize.xs, color: colors.textDisabled },
  offerBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
  },
  offerBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textInverse },
  offeredBadge: { backgroundColor: '#dcfce7', borderColor: '#16a34a', borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full },
  offeredBadgeText: { fontSize: fontSize.xs, color: '#15803d', fontWeight: fontWeight.semibold },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  modalSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },
  msgInput: { height: 80, paddingTop: 14 },
  euroSign: { fontSize: fontSize.md, color: colors.textSecondary },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  modalBtn: { flex: 1 },
  offerErrorText: { fontSize: fontSize.sm, color: colors.error, backgroundColor: '#fee2e2', padding: spacing.sm, borderRadius: 6, marginBottom: spacing.sm },
  successBanner: { backgroundColor: '#dcfce7', borderColor: '#16a34a', borderWidth: 1, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: 8 },
  successBannerText: { fontSize: fontSize.sm, color: '#15803d', fontWeight: fontWeight.medium },
})
