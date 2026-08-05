import React, { useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useStripe } from '@stripe/stripe-react-native'
import { paymentMethodsApi, type SavedPaymentMethod } from '../../src/api/payment-methods.api'
import { Button } from '../../src/components/ui/Button'
import { ConfirmModal } from '../../src/components/ui/ConfirmModal'
import { getApiErrorMessage } from '../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'

const BRAND_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
}

export default function PaymentMethodsScreen() {
  const router = useRouter()
  const qc = useQueryClient()
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const [addingCard, setAddingCard] = useState(false)
  const [error, setError] = useState('')
  const [removeTarget, setRemoveTarget] = useState<SavedPaymentMethod | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['saved-payment-methods'],
    queryFn: () => paymentMethodsApi.list().then((r) => r.data),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => paymentMethodsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-payment-methods'] })
      setRemoveTarget(null)
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => paymentMethodsApi.setDefault(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-payment-methods'] }),
  })

  const handleAddCard = async () => {
    if (Platform.OS === 'web') {
      setError('Karten können derzeit nur über die mobile App hinzugefügt werden.')
      return
    }
    setAddingCard(true)
    setError('')
    try {
      const { data } = await paymentMethodsApi.createSetupIntent()
      const { error: initError } = await initPaymentSheet({
        setupIntentClientSecret: data.clientSecret,
        merchantDisplayName: 'Ich habe Zeit',
        style: 'automatic',
      })
      if (initError) {
        setError(initError.message)
        return
      }
      const { error: presentError } = await presentPaymentSheet()
      if (presentError) {
        if (presentError.code !== 'Canceled') setError(presentError.message)
        return
      }
      qc.invalidateQueries({ queryKey: ['saved-payment-methods'] })
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setAddingCard(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Zahlungsmethoden</Text>
        <View style={{ width: 60 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <FlatList
          data={data?.paymentMethods ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💳</Text>
              <Text style={styles.emptyTitle}>Keine gespeicherten Karten</Text>
              <Text style={styles.emptyText}>Füge eine Karte hinzu, um schneller zu bezahlen.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardIcon}>
                <Text style={styles.cardIconText}>💳</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardBrand}>{BRAND_LABEL[item.brand] ?? item.brand} •••• {item.last4}</Text>
                <Text style={styles.cardExpiry}>Gültig bis {String(item.expMonth).padStart(2, '0')}/{item.expYear}</Text>
              </View>
              {item.isDefault ? (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultBadgeText}>Standard</Text>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setDefaultMutation.mutate(item.id)}>
                  <Text style={styles.actionLink}>Als Standard</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setRemoveTarget(item)} style={{ marginLeft: spacing.md }}>
                <Text style={[styles.actionLink, styles.removeLink]}>Entfernen</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <View style={styles.footer}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Button label="Karte hinzufügen" onPress={handleAddCard} loading={addingCard} />
      </View>

      <ConfirmModal
        visible={!!removeTarget}
        title="Karte entfernen?"
        message={removeTarget ? `${BRAND_LABEL[removeTarget.brand] ?? removeTarget.brand} •••• ${removeTarget.last4} wird entfernt.` : ''}
        confirmLabel="Entfernen"
        destructive
        loading={removeMutation.isPending}
        onConfirm={() => removeMutation.mutate(removeTarget!.id)}
        onCancel={() => setRemoveTarget(null)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { fontSize: fontSize.sm, color: colors.primary },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  cardIconText: { fontSize: 18 },
  cardBrand: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text },
  cardExpiry: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  defaultBadge: { backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  defaultBadgeText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.medium },
  actionLink: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.medium },
  removeLink: { color: colors.error },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  errorText: { fontSize: fontSize.sm, color: colors.error, marginBottom: spacing.sm, textAlign: 'center' },
})
