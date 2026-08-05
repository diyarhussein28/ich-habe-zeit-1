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
import { useQuery } from '@tanstack/react-query'
import { ordersApi } from '../../src/api/orders.api'
import { useAuthStore } from '../../src/store/auth.store'
import { useChatSocket } from '../../src/hooks/useChatSocket'
import { colors, spacing, fontSize, fontWeight, radius } from '../../src/constants/theme'
import type { ChatMessage } from '../../src/api/types'

export default function ChatScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [sending, setSending] = useState(false)
  const flatListRef = useRef<FlatList>(null)

  const { data: orderData } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => ordersApi.get(orderId).then((r) => r.data.order),
    enabled: !!orderId,
  })

  const scrollToEnd = useCallback((animated = true) => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated }), 80)
  }, [])

  const onHistory = useCallback((hist: ChatMessage[]) => {
    setMessages(hist)
    setConnected(true)
    scrollToEnd(false)
  }, [scrollToEnd])

  const onMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      // Deduplicate by id in case of echo
      if (prev.some((m) => m.id === msg.id)) return prev
      return [...prev, msg]
    })
    scrollToEnd()
  }, [scrollToEnd])

  const { sendMessage } = useChatSocket({
    orderId: orderId ?? '',
    onHistory,
    onMessage,
  })

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    const sent = sendMessage(trimmed)
    if (sent) setText('')
    setSending(false)
  }

  const title = orderData?.request?.title ?? `Auftrag #${orderId?.slice(-6) ?? ''}`

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.statusDot}>
          <View style={[styles.dot, connected ? styles.dotOnline : styles.dotOffline]} />
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
        keyboardVerticalOffset={0}
      >
        {!connected && messages.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Verbinde...</Text>
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
                <Text style={styles.emptyChatText}>Noch keine Nachrichten. Schreibe als Erstes!</Text>
              </View>
            }
            renderItem={({ item }) => (
              <MessageBubble message={item} isOwn={item.senderId === user?.id} />
            )}
          />
        )}

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Nachricht schreiben..."
            placeholderTextColor={colors.textDisabled}
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim() || sending || !connected}
            style={[styles.sendBtn, (!text.trim() || !connected) ? styles.sendBtnDisabled : null]}
          >
            {sending ? (
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

function MessageBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  if (message.isSystemMessage) {
    return (
      <View style={bubbleStyles.systemRow}>
        <Text style={bubbleStyles.systemText}>{message.content}</Text>
      </View>
    )
  }

  return (
    <View style={[bubbleStyles.row, isOwn ? bubbleStyles.rowOwn : null]}>
      <View style={[bubbleStyles.bubble, isOwn ? bubbleStyles.bubbleOwn : bubbleStyles.bubbleOther]}>
        <Text style={[bubbleStyles.text, isOwn ? bubbleStyles.textOwn : null]}>
          {message.content}
        </Text>
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
  bubble: {
    maxWidth: '78%',
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 4,
  },
  bubbleOwn: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: 4,
  },
  bubbleOther: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  text: { fontSize: fontSize.md, lineHeight: 22, color: colors.text },
  textOwn: { color: colors.textInverse },
  time: { fontSize: 11, color: colors.textSecondary, marginTop: 4, alignSelf: 'flex-end' },
  timeOwn: { color: 'rgba(255,255,255,0.7)' },
  systemRow: { alignItems: 'center', marginVertical: spacing.sm },
  systemText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    backgroundColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    textAlign: 'center',
  },
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
  headerTitle: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  statusDot: { width: 24, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOnline: { backgroundColor: colors.secondary },
  dotOffline: { backgroundColor: colors.textDisabled },
  kav: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { fontSize: fontSize.sm, color: colors.textSecondary },
  messageList: { padding: spacing.md, flexGrow: 1 },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xxl },
  emptyChatText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
    color: colors.text,
    maxHeight: 120,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.textDisabled },
  sendIcon: { fontSize: 20, color: colors.textInverse, fontWeight: fontWeight.bold },
})
