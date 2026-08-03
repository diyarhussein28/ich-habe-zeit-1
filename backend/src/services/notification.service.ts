import { env } from '../config/env.js'
import nodemailer from 'nodemailer'

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
