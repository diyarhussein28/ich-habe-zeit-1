import { env } from '../config/env.js'
import nodemailer from 'nodemailer'
import { prisma } from '../config/prisma.js'
import { sendPushToUser, type PushType } from './push.service.js'

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
})

export async function sendEmail(to: string, subject: string, html: string) {
  if (env.NODE_ENV === 'test') return

  try {
    await transporter.sendMail({ from: env.EMAIL_FROM, to, subject, html })
  } catch (err) {
    console.error('Email send failed:', err)
  }
}

export async function sendSms(to: string, message: string) {
  if (env.SMS_PROVIDER === 'stub' || env.NODE_ENV === 'test') {
    console.log(`[SMS STUB] To: ${to} | Message: ${message}`)
    return
  }
  // Twilio integration goes here in Phase 2
}

export async function sendOtpEmail(to: string, code: string) {
  if (env.NODE_ENV !== 'production') {
    console.log(`[DEV OTP] ${to} → ${code}`)
  }
  await sendEmail(
    to,
    'Ihr Verifizierungscode — Ich habe Zeit',
    `<p>Ihr Code: <strong>${code}</strong></p><p>Gültig für ${env.OTP_EXPIRES_IN_MINUTES} Minuten.</p>`
  )
}

export async function sendOtpSms(to: string, code: string) {
  await sendSms(to, `Ich habe Zeit: Ihr Code lautet ${code}. Gültig für ${env.OTP_EXPIRES_IN_MINUTES} Min.`)
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  if (env.NODE_ENV !== 'production') {
    console.log(`[DEV RESET LINK] ${to} → ${resetUrl}`)
  }
  await sendEmail(
    to,
    'Passwort zurücksetzen — Ich habe Zeit',
    `<p>Sie haben angefordert, Ihr Passwort zurückzusetzen.</p>
     <p><a href="${resetUrl}">Passwort jetzt zurücksetzen</a></p>
     <p>Dieser Link ist 1 Stunde gültig und kann nur einmal verwendet werden.</p>
     <p>Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail — Ihr Passwort bleibt unverändert.</p>`
  )
}

export async function sendNewDeviceOtpEmail(to: string, code: string) {
  if (env.NODE_ENV !== 'production') {
    console.log(`[DEV DEVICE OTP] ${to} → ${code}`)
  }
  await sendEmail(
    to,
    'Neues Gerät erkannt — Ich habe Zeit',
    `<p>Wir haben eine Anmeldung von einem neuen Gerät erkannt.</p>
     <p>Ihr Bestätigungscode: <strong>${code}</strong></p>
     <p>Gültig für ${env.OTP_EXPIRES_IN_MINUTES} Minuten. Falls Sie das nicht waren, ändern Sie umgehend Ihr Passwort.</p>`
  )
}

// ─── Unified event dispatcher ──────────────────────────────────────────────────
// Sends push + email (+ optional SMS for high-severity events) for a platform
// event in one call, respecting the user's NotificationSettings toggles —
// both the global pushEnabled/emailEnabled/smsEnabled switches AND the
// granular per-event ones (newOfferPush, newOfferEmail, chatMessagePush).

export type NotificationCategory = 'newOffer' | 'chatMessage' | 'general'

export interface NotifyEventOptions {
  userId: string
  pushType: PushType
  title: string
  body: string
  emailHtml?: string
  smsBody?: string
  orderId?: string
  requestId?: string
  category?: NotificationCategory
  /** Skip the email channel entirely regardless of emailEnabled (e.g. chat messages, which are push-only). */
  skipEmail?: boolean
}

type Settings = {
  pushEnabled: boolean
  emailEnabled: boolean
  smsEnabled: boolean
  newOfferPush: boolean
  newOfferEmail: boolean
  chatMessagePush: boolean
} | null

function isPushAllowed(category: NotificationCategory | undefined, settings: Settings): boolean {
  if (settings?.pushEnabled === false) return false
  if (category === 'newOffer' && settings?.newOfferPush === false) return false
  if (category === 'chatMessage' && settings?.chatMessagePush === false) return false
  return true
}

function isEmailAllowed(category: NotificationCategory | undefined, settings: Settings): boolean {
  if (settings?.emailEnabled === false) return false
  if (category === 'newOffer' && settings?.newOfferEmail === false) return false
  return true
}

function emailWrapper(title: string, bodyHtml: string): string {
  return `<div style="font-family: -apple-system, sans-serif; max-width: 480px;">
    <h2 style="color:#1A56DB; margin-bottom: 8px;">${title}</h2>
    <div style="color:#0F172A; line-height:1.6;">${bodyHtml}</div>
    <p style="color:#94A3B8; font-size:12px; margin-top:24px;">Ich habe Zeit — diese Nachricht wurde automatisch generiert.</p>
  </div>`
}

export async function notifyEvent(opts: NotifyEventOptions): Promise<void> {
  const [user, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: opts.userId }, select: { email: true, phone: true } }),
    prisma.notificationSettings.findUnique({ where: { userId: opts.userId } }),
  ])
  if (!user) return

  if (isPushAllowed(opts.category, settings)) {
    sendPushToUser(opts.userId, { type: opts.pushType, orderId: opts.orderId, requestId: opts.requestId }, opts.title, opts.body).catch(() => {})
  }
  if (!opts.skipEmail && isEmailAllowed(opts.category, settings)) {
    sendEmail(user.email, `${opts.title} — Ich habe Zeit`, emailWrapper(opts.title, opts.emailHtml ?? `<p>${opts.body}</p>`)).catch(() => {})
  }
  if (opts.smsBody && settings?.smsEnabled) {
    sendSms(user.phone, opts.smsBody).catch(() => {})
  }
}
