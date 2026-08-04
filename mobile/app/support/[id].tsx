import React, { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supportApi, type SupportMessage } from '../../src/api/support.api'
import { useAuthStore } from '../../src/store/auth.store'
import { Badge } from '../../src/components/ui/Badge'
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

export default function SupportTicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['support-ticket', id],
    queryFn: () => supportApi.get(id).then((r) => r.data.ticket),
    enabled: !!id,
    refetchInterval: 10000,
  })

  const sendMutation = useMutation({
    mutationFn: () => supportApi.sendMessage(id, content.trim()),
    onSuccess: () => {
      setContent('')
      setError(null)
      qc.invalidateQueries({ queryKey: ['support-ticket', id] })
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  if (isLoading || !ticket) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </SafeAreaView>
    )
  }

  const isClosed = ticket.status === 'CLOSED'

  return (
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backBtn}>← Zurück</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{ticket.subject}</Text>
          <Badge label={STATUS_LABEL[ticket.status] ?? ticket.status} color={STATUS_COLOR[ticket.status] ?? 'neutral'} />
        </View>

        <FlatList
          data={ticket.messages ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.originalCard}>
              <Text style={styles.originalText}>{ticket.description}</Text>
              <Text style={styles.date}>{formatDate(ticket.createdAt)}</Text>
            </View>
          }
          renderItem={({ item }: { item: SupportMessage }) => {
            const isMine = item.senderId === user?.id
            return (
              <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{item.content}</Text>
                <Text style={[styles.bubbleDate, isMine && styles.bubbleDateMine]}>{formatDate(item.createdAt)}</Text>
              </View>
            )
          }}
        />

        {isClosed ? (
          <View style={styles.closedNote}>
            <Text style={styles.closedNoteText}>Diese Anfrage wurde geschlossen.</Text>
          </View>
        ) : (
          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              placeholder="Nachricht schreiben…"
              placeholderTextColor={colors.textDisabled}
              value={content}
              onChangeText={setContent}
              multiline
            />
            <TouchableOpacity
              style={styles.sendBtn}
              disabled={!content.trim() || sendMutation.isPending}
              onPress={() => sendMutation.mutate()}
            >
              {sendMutation.isPending ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.sendBtnText}>➤</Text>}
            </TouchableOpacity>
          </View>
        )}
        {error && <Text style={styles.errorText}>{error}</Text>}
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { fontSize: fontSize.sm, color: colors.primary },
  title: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  listContent: { padding: spacing.lg, gap: spacing.sm },
  originalCard: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  originalText: { fontSize: fontSize.sm, color: colors.text },
  date: { fontSize: fontSize.xs, color: colors.textDisabled, marginTop: spacing.xs },
  bubble: { maxWidth: '80%', borderRadius: radius.md, padding: spacing.sm },
  bubbleMine: { backgroundColor: colors.primary, alignSelf: 'flex-end' },
  bubbleTheirs: { backgroundColor: colors.surface, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontSize: fontSize.sm, color: colors.text },
  bubbleTextMine: { color: colors.textInverse },
  bubbleDate: { fontSize: fontSize.xs, color: colors.textDisabled, marginTop: spacing.xs },
  bubbleDateMine: { color: colors.textInverse, opacity: 0.7 },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
  },
  composerInput: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.sm,
    color: colors.text, maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnText: { color: colors.textInverse, fontSize: fontSize.md },
  closedNote: { padding: spacing.md, alignItems: 'center' },
  closedNoteText: { fontSize: fontSize.sm, color: colors.textSecondary },
  errorText: { fontSize: fontSize.sm, color: colors.error, textAlign: 'center', paddingBottom: spacing.sm },
})
