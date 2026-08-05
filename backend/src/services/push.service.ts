import Expo, { type ExpoPushMessage } from 'expo-server-sdk'
import { prisma } from '../config/prisma.js'

const expo = new Expo()

export type PushType =
  | 'NEW_OFFER'
  | 'OFFER_ACCEPTED'
  | 'ORDER_UPDATE'
  | 'PAYMENT_CAPTURED'
  | 'RELEASE_REMINDER'
  | 'APPOINTMENT_REMINDER'
  | 'NEW_MESSAGE'
  | 'DISPUTE_OPENED'
  | 'DISPUTE_UPDATE'
  | 'INVOICE_ISSUED'
  | 'ACCOUNT_STATUS'
  | 'KYC_VERIFIED'
  | 'KYC_REJECTED'
  | 'KYC_RESUBMISSION'

export interface PushData {
  type: PushType
  orderId?: string
  requestId?: string
  messageId?: string
}

export async function sendPushToUser(
  userId: string,
  data: PushData,
  title: string,
  body: string,
): Promise<void> {
  const rows = await prisma.pushToken.findMany({
    where: { userId },
    select: { token: true },
  })

  const messages: ExpoPushMessage[] = rows
    .filter((r) => Expo.isExpoPushToken(r.token))
    .map((r) => ({
      to: r.token,
      sound: 'default' as const,
      title,
      body,
      data: data as unknown as Record<string, unknown>,
    }))

  if (messages.length === 0) return

  const chunks = expo.chunkPushNotifications(messages)
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk)
    } catch (err) {
      console.error('[push] send failed:', err)
    }
  }
}
