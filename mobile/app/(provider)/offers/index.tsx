import React from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SafeAreaView } from 'react-native-safe-area-context'
import { requestsApi } from '../../../src/api/requests.api'
import { Card } from '../../../src/components/ui/Card'
import { Badge } from '../../../src/components/ui/Badge'
import { getApiErrorMessage } from '../../../src/api/client'
import { colors, spacing, fontSize, fontWeight } from '../../../src/constants/theme'
import { formatEur } from '../../../src/utils/currency'
import type { Offer } from '../../../src/api/types'
import { formatDate } from '../../../src/utils/date'

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Ausstehend',
  ACCEPTED: 'Angenommen',
  REJECTED: 'Abgelehnt',
  WITHDRAWN: 'Zurückgezogen',
  EXPIRED: 'Abgelaufen',
}

const STATUS_COLOR: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'error',
  WITHDRAWN: 'neutral',
  EXPIRED: 'neutral',
}

export default function MyOffersScreen() {
  const qc = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-offers'],
    queryFn: () => requestsApi.myOffers({ limit: 50 }).then((r) => r.data),
  })

  const withdrawMutation = useMutation({
    mutationFn: (offerId: string) => requestsApi.withdrawOffer(offerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-offers'] }),
    onError: (err) => Alert.alert('Fehler', getApiErrorMessage(err)),
  })

  const offers = data?.offers ?? []

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Meine Angebote</Text>
      </View>

      <FlatList
        data={offers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📝</Text>
              <Text style={styles.emptyTitle}>Keine Angebote</Text>
              <Text style={styles.emptyText}>Du hast noch keine Angebote abgegeben.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <OfferCard
            offer={item}
            onWithdraw={
              item.status === 'PENDING'
                ? () =>
                    Alert.alert('Angebot zurückziehen', 'Möchtest du dieses Angebot wirklich zurückziehen?', [
                      { text: 'Abbrechen', style: 'cancel' },
                      { text: 'Zurückziehen', style: 'destructive', onPress: () => withdrawMutation.mutate(item.id) },
                    ])
                : undefined
            }
          />
        )}
      />
    </SafeAreaView>
  )
}

function OfferCard({ offer, onWithdraw }: { offer: Offer; onWithdraw?: () => void }) {
  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.price}>{formatEur(offer.proposedPrice ?? offer.price ?? 0)}</Text>
        <Badge label={STATUS_LABEL[offer.status] ?? offer.status} color={STATUS_COLOR[offer.status] ?? 'neutral'} />
      </View>
      <Text style={styles.message} numberOfLines={3}>{offer.scopeOfWork ?? offer.message ?? ''}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.date}>
          Gültig bis: {formatDate(offer.validUntil)}
        </Text>
        {onWithdraw ? (
          <TouchableOpacity onPress={onWithdraw}>
            <Text style={styles.withdrawLink}>Zurückziehen</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  card: { marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  price: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.secondary },
  message: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.sm },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: fontSize.xs, color: colors.textDisabled },
  withdrawLink: { fontSize: fontSize.sm, color: colors.error, fontWeight: fontWeight.medium },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center' },
})
