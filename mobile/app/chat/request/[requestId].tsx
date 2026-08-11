import React, { useState, useRef, useCallback } from 'react'
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
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { requestChatApi, type RequestChatMessage } from '../../../src/api/requestChat.api'
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

  const scrollToEnd = useCallback((animated = true) => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated }), 80)
  }, [])

  const { data: messages, isLoading } = useQuery({
    queryKey: ['request-chat', requestId, providerIdParam ?? 'mine'],
    queryFn: async () => {
      if (providerIdParam) {
        const res = await requestChatApi.getMessages(requestId, providerIdParam)
        return res.data.messages
      }
      const res = await requestChatApi.openMine(requestId)
      setResolvedProviderId(res.data.chat.providerId)
      return res.data.chat.messages
    },
    enabled: !!requestId,
    refetchInterval: 4000,
  })

  const sendMutation = useMutation({
    mutationFn: (content: string) => requestChatApi.sendMessage(requestId, resolvedProviderId!, content),
    onSuccess: () => {
      setText('')
      qc.invalidateQueries({ queryKey: ['request-chat', requestId, providerIdParam ?? 'mine'] })
      scrollToEnd()
    },
  })

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || !resolvedProviderId || sendMutation.isPending) return
    sendMutation.mutate(trimmed)
  }

  const headerTitle = otherPartyName ?? title ?? 'Anfrage-Chat'

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>Anfrage vor Angebot</Text>
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
            data={messages ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatText}>
                  Noch keine Nachrichten. Stelle deine Fragen, bevor du ein Angebot abgibst.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <MessageBubble message={item} isOwn={item.senderId === user?.id} />
            )}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Frage stellen..."
            placeholderTextColor={colors.textDisabled}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim() || sendMutation.isPending || !resolvedProviderId}
            style={[styles.sendBtn, (!text.trim() || !resolvedProviderId) ? styles.sendBtnDisabled : null]}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={styles.sendIcon}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function MessageBubble({ message, isOwn }: { message: RequestChatMessage; isOwn: boolean }) {
  if (message.isSystem) {
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
  emptyChatText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: spacing.md, paddingTop: spacing.sm,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm,
  },
  input: {
    flex: 1, backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md, color: colors.text, maxHeight: 120,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.textDisabled },
  sendIcon: { fontSize: 20, color: colors.textInverse, fontWeight: fontWeight.bold },
})
