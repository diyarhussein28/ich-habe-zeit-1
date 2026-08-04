import React, { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supportApi, type SupportTicket } from '../../src/api/support.api'
import { Card } from '../../src/components/ui/Card'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { getApiErrorMessage } from '../../src/api/client'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'
import { formatDate } from '../../src/utils/date'

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Offen',
  IN_PROGRESS: 'In Bearbeitung',
  RESOLVED: 'Gelöst',
  CLOSED: 'Geschlossen',
}

const STATUS_COLOR: Record<string, 'primary' | 'success' | 'warning' | 'neutral'> = {
  OPEN: 'warning',
  IN_PROGRESS: 'primary',
  RESOLVED: 'success',
  CLOSED: 'neutral',
}

export default function SupportListScreen() {
  const router = useRouter()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => supportApi.list().then((r) => r.data.tickets),
  })

  const createMutation = useMutation({
    mutationFn: () => supportApi.create(subject.trim(), description.trim()),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['support-tickets'] })
      setShowCreate(false)
      setSubject('')
      setDescription('')
      setError(null)
      router.push(`/support/${res.data.ticket.id}`)
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Support</Text>
        <TouchableOpacity onPress={() => setShowCreate(true)}>
          <Text style={styles.newBtn}>+ Neu</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🎧</Text>
              <Text style={styles.emptyTitle}>Noch keine Anfragen</Text>
              <Text style={styles.emptyText}>Erstelle eine Anfrage, wenn du Hilfe brauchst.</Text>
            </View>
          }
          renderItem={({ item }: { item: SupportTicket }) => (
            <TouchableOpacity onPress={() => router.push(`/support/${item.id}`)}>
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.subject} numberOfLines={1}>{item.subject}</Text>
                  <Badge label={STATUS_LABEL[item.status] ?? item.status} color={STATUS_COLOR[item.status] ?? 'neutral'} />
                </View>
                <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
                <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Neue Anfrage</Text>
            <TextInput
              style={styles.input}
              placeholder="Betreff"
              placeholderTextColor={colors.textDisabled}
              value={subject}
              onChangeText={setSubject}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Wie können wir helfen? (mindestens 10 Zeichen)"
              placeholderTextColor={colors.textDisabled}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
            <View style={styles.modalActions}>
              <Button label="Abbrechen" variant="outline" onPress={() => setShowCreate(false)} fullWidth={false} style={styles.modalBtn} />
              <Button
                label="Senden"
                onPress={() => {
                  if (subject.trim().length < 3) { setError('Bitte gib einen Betreff ein.'); return }
                  if (description.trim().length < 10) { setError('Bitte beschreibe dein Anliegen etwas genauer.'); return }
                  setError(null)
                  createMutation.mutate()
                }}
                loading={createMutation.isPending}
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  backBtn: { fontSize: fontSize.sm, color: colors.primary },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  newBtn: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary },
  listContent: { padding: spacing.lg, gap: spacing.sm },
  card: { padding: spacing.md, gap: spacing.xs },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  subject: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  description: { fontSize: fontSize.sm, color: colors.textSecondary },
  date: { fontSize: fontSize.xs, color: colors.textDisabled, marginTop: spacing.xs },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  modalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.sm, fontSize: fontSize.sm, color: colors.text,
  },
  textArea: { height: 90 },
  errorText: { fontSize: fontSize.sm, color: colors.error },
  modalActions: { flexDirection: 'row', gap: spacing.md },
  modalBtn: { flex: 1 },
})
