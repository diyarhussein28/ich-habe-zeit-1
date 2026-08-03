import React, { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import * as SecureStore from 'expo-secure-store'
import { invoicesApi, type Invoice } from '../../../src/api/invoices.api'
import { TOKEN_KEY } from '../../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../../src/constants/theme'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

const TYPE_LABEL: Record<string, string> = {
  SERVICE_INVOICE: 'Dienstleistungsrechnung',
  COMMISSION_INVOICE: 'Vermittlungsgebühr',
}

const eur = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

const de = (d: string) =>
  new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

export default function InvoicesScreen() {
  const router = useRouter()
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => invoicesApi.list().then((r) => r.data.invoices),
  })

  const downloadPdf = async (invoice: Invoice) => {
    if (downloadingId) return
    setDownloadingId(invoice.id)
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY)
      if (!token) {
        Alert.alert('Fehler', 'Bitte melde dich erneut an.')
        return
      }

      const url = `${BASE_URL}/api/invoices/${invoice.id}/pdf`
      const fileUri = `${FileSystem.cacheDirectory}${invoice.invoiceNumber}.pdf`

      const result = await FileSystem.downloadAsync(url, fileUri, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (result.status !== 200) {
        throw new Error(`HTTP ${result.status}`)
      }

      const canShare = await Sharing.isAvailableAsync()
      if (!canShare) {
        Alert.alert('Hinweis', `Datei gespeichert unter:\n${result.uri}`)
        return
      }

      await Sharing.shareAsync(result.uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Rechnung ${invoice.invoiceNumber}`,
        UTI: 'com.adobe.pdf',
      })
    } catch (err) {
      Alert.alert('Fehler', 'Die Rechnung konnte nicht heruntergeladen werden.')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Rechnungen</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Fehler beim Laden der Rechnungen.</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Erneut versuchen</Text>
          </TouchableOpacity>
        </View>
      ) : !data || data.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>📄</Text>
          <Text style={styles.emptyTitle}>Keine Rechnungen</Text>
          <Text style={styles.emptyText}>Deine Rechnungen erscheinen hier, sobald ein Auftrag abgeschlossen wurde.</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <InvoiceCard
              invoice={item}
              downloading={downloadingId === item.id}
              onDownload={() => downloadPdf(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  )
}

function InvoiceCard({
  invoice,
  downloading,
  onDownload,
}: {
  invoice: Invoice
  downloading: boolean
  onDownload: () => void
}) {
  const isCommission = invoice.invoiceType === 'COMMISSION_INVOICE'
  return (
    <View style={cardStyles.container}>
      <View style={cardStyles.top}>
        <View style={[cardStyles.typeBadge, isCommission ? cardStyles.commBadge : cardStyles.svcBadge]}>
          <Text style={[cardStyles.typeBadgeText, isCommission ? cardStyles.commBadgeText : cardStyles.svcBadgeText]}>
            {TYPE_LABEL[invoice.invoiceType]}
          </Text>
        </View>
        <Text style={cardStyles.number}>{invoice.invoiceNumber}</Text>
      </View>

      <Text style={cardStyles.category}>
        {invoice.order.request.category?.name ?? 'Dienstleistung'}
      </Text>

      <View style={cardStyles.row}>
        <View>
          <Text style={cardStyles.metaLabel}>Datum</Text>
          <Text style={cardStyles.metaValue}>{de(invoice.issueDate)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={cardStyles.metaLabel}>Gesamtbetrag</Text>
          <Text style={cardStyles.amount}>{eur(invoice.totalAmount)}</Text>
        </View>
      </View>

      {invoice.vatRate === 0 && (
        <Text style={cardStyles.vatNote}>§ 19 UStG (Kleinunternehmer, keine MwSt.)</Text>
      )}

      <TouchableOpacity
        onPress={onDownload}
        disabled={downloading}
        style={[cardStyles.dlBtn, downloading ? cardStyles.dlBtnDisabled : null]}
        activeOpacity={0.8}
      >
        {downloading ? (
          <ActivityIndicator size="small" color={colors.textInverse} />
        ) : (
          <Text style={cardStyles.dlBtnText}>PDF herunterladen</Text>
        )}
      </TouchableOpacity>
    </View>
  )
}

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  typeBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  svcBadge: { backgroundColor: '#EFF6FF' },
  commBadge: { backgroundColor: '#FFF7ED' },
  typeBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  svcBadgeText: { color: '#1D4ED8' },
  commBadgeText: { color: '#C2410C' },
  number: { fontSize: fontSize.sm, color: colors.textSecondary },
  category: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: spacing.sm },
  metaLabel: { fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: 2 },
  metaValue: { fontSize: fontSize.sm, color: colors.text },
  amount: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  vatNote: { fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: spacing.sm, fontStyle: 'italic' },
  dlBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  dlBtnDisabled: { backgroundColor: colors.textDisabled },
  dlBtnText: { color: colors.textInverse, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
})

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm },
  backText: { fontSize: 28, color: colors.primary, lineHeight: 28 },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorText: { fontSize: fontSize.md, color: colors.error, textAlign: 'center', marginBottom: spacing.md },
  retryBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.md },
  retryText: { color: colors.textInverse, fontWeight: fontWeight.semibold },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  list: { padding: spacing.md },
})
