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
import { formatDate } from '../../../src/utils/date'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

const TYPE_LABEL: Record<string, string> = {
  SERVICE_INVOICE: 'Dienstleistungsrechnung',
  COMMISSION_INVOICE: 'Vermittlungsgebühr',
}

const eur = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

// Downloads the invoice PDF to a local cache file, reused by both preview
// and download so the auth/fetch logic lives in exactly one place.
async function fetchInvoicePdf(invoice: Invoice): Promise<string> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY)
  if (!token) throw new Error('NO_TOKEN')

  const url = `${BASE_URL}/api/invoices/${invoice.id}/pdf`
  const fileUri = `${FileSystem.cacheDirectory}${invoice.invoiceNumber}.pdf`

  const result = await FileSystem.downloadAsync(url, fileUri, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (result.status !== 200) throw new Error(`HTTP ${result.status}`)
  return result.uri
}

export default function InvoicesScreen() {
  const router = useRouter()
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [previewingId, setPreviewingId] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => invoicesApi.list().then((r) => r.data.invoices),
  })

  const previewPdf = async (invoice: Invoice) => {
    if (downloadingId || previewingId) return
    setPreviewingId(invoice.id)
    try {
      const uri = await fetchInvoicePdf(invoice)
      router.push({ pathname: '/invoice-preview', params: { uri, title: invoice.invoiceNumber } })
    } catch (err) {
      if (err instanceof Error && err.message === 'NO_TOKEN') {
        Alert.alert('Fehler', 'Bitte melde dich erneut an.')
      } else {
        Alert.alert('Fehler', 'Die Rechnung konnte nicht geladen werden.')
      }
    } finally {
      setPreviewingId(null)
    }
  }

  const downloadPdf = async (invoice: Invoice) => {
    if (downloadingId || previewingId) return
    setDownloadingId(invoice.id)
    try {
      const uri = await fetchInvoicePdf(invoice)

      // The actual loading work (fetching the PDF) is done — reset the spinner
      // here rather than after the share sheet. expo-sharing's promise isn't
      // guaranteed to resolve when the user just dismisses the native share
      // sheet without picking an action, which would otherwise leave the
      // button stuck spinning indefinitely.
      setDownloadingId(null)

      const canShare = await Sharing.isAvailableAsync()
      if (!canShare) {
        Alert.alert('Hinweis', `Datei gespeichert unter:\n${uri}`)
        return
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Rechnung ${invoice.invoiceNumber}`,
        UTI: 'com.adobe.pdf',
      }).catch(() => {})
    } catch (err) {
      setDownloadingId(null)
      if (err instanceof Error && err.message === 'NO_TOKEN') {
        Alert.alert('Fehler', 'Bitte melde dich erneut an.')
      } else {
        Alert.alert('Fehler', 'Die Rechnung konnte nicht heruntergeladen werden.')
      }
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
              previewing={previewingId === item.id}
              onDownload={() => downloadPdf(item)}
              onPreview={() => previewPdf(item)}
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
  previewing,
  onDownload,
  onPreview,
}: {
  invoice: Invoice
  downloading: boolean
  previewing: boolean
  onDownload: () => void
  onPreview: () => void
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
          <Text style={cardStyles.metaValue}>{formatDate(invoice.issueDate)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={cardStyles.metaLabel}>Gesamtbetrag</Text>
          <Text style={cardStyles.amount}>{eur(invoice.totalAmount)}</Text>
        </View>
      </View>

      {invoice.vatRate === 0 && (
        <Text style={cardStyles.vatNote}>§ 19 UStG (Kleinunternehmer, keine MwSt.)</Text>
      )}

      <View style={cardStyles.actions}>
        <TouchableOpacity
          onPress={onPreview}
          disabled={previewing || downloading}
          style={[cardStyles.previewBtn, (previewing || downloading) ? cardStyles.btnDisabled : null]}
          activeOpacity={0.8}
        >
          {previewing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={cardStyles.previewBtnText}>👁 Vorschau</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDownload}
          disabled={downloading || previewing}
          style={[cardStyles.dlBtn, (downloading || previewing) ? cardStyles.btnDisabled : null]}
          activeOpacity={0.8}
        >
          {downloading ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text style={cardStyles.dlBtnText}>Herunterladen</Text>
          )}
        </TouchableOpacity>
      </View>
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
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  previewBtn: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  previewBtnText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  dlBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
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
