import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { prisma } from '../config/prisma.js'
import { createOtp, verifyOtp, incrementOtpAttempts } from './otp.service.js'
import { sendOtpEmail, sendOtpSms, sendPasswordResetEmail, sendNewDeviceOtpEmail } from './notification.service.js'
import { checkDuplicateRegistration, recordConsent } from './moderation.service.js'
import {
  generateTotpSecret,
  generateTotpUri,
  verifyTotpToken,
  generateRecoveryCodes,
  hashRecoveryCode,
} from '../lib/totp.js'
import type { UserRole } from '@prisma/client'

// Short, shareable, human-typeable referral code — not cryptographically
// sensitive (it's meant to be given out), just needs to be unique and
// unambiguous (no 0/O/1/I confusion).
const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generateReferralCode(): string {
  let code = ''
  const bytes = randomBytes(6)
  for (let i = 0; i < 6; i++) code += REFERRAL_ALPHABET[bytes[i] % REFERRAL_ALPHABET.length]
  return code
}

async function uniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode()
    const existing = await prisma.user.findUnique({ where: { referralCode: code } })
    if (!existing) return code
  }
  // Astronomically unlikely with a 32^6 keyspace, but fall back to something
  // still unique rather than looping forever.
  return `${generateReferralCode()}${Date.now().toString(36).toUpperCase().slice(-3)}`
}

export async function registerUser(data: {
  email: string
  phone: string
  password: string
  displayName: string
  role: UserRole
  registrationIp?: string
  registrationDeviceId?: string
  consentVersion?: string
  referralCode?: string
}) {
  const existingEmail = await prisma.user.findUnique({ where: { email: data.email } })
  if (existingEmail) throw new Error('EMAIL_TAKEN')

  const existingPhone = await prisma.user.findUnique({ where: { phone: data.phone } })
  if (existingPhone) throw new Error('PHONE_TAKEN')

  await checkDuplicateRegistration({
    email: data.email,
    phone: data.phone,
    deviceId: data.registrationDeviceId,
    ip: data.registrationIp,
  })

  let referredByUserId: string | undefined
  if (data.referralCode) {
    const referrer = await prisma.user.findUnique({ where: { referralCode: data.referralCode.toUpperCase() } })
    // An unknown/mistyped code is silently ignored rather than blocking
    // registration — referral attribution is a bonus, not a gate.
    if (referrer) referredByUserId = referrer.id
  }

  const passwordHash = await bcrypt.hash(data.password, 12)
  const referralCode = await uniqueReferralCode()

  const user = await prisma.user.create({
    data: {
      email: data.email,
      phone: data.phone,
      passwordHash,
      role: data.role,
      displayName: data.displayName,
      registrationIp: data.registrationIp,
      registrationDeviceId: data.registrationDeviceId,
      referralCode,
      referredByUserId,
      notificationSettings: { create: {} },
    },
  })

  if (data.role === 'CUSTOMER') {
    await prisma.customerProfile.create({ data: { userId: user.id } })
  } else if (data.role === 'PROVIDER') {
    await prisma.providerProfile.create({ data: { userId: user.id } })
  }

  // GDPR Art. 7 — record consent to AGB + privacy policy given at registration
  if (data.registrationIp) {
    await recordConsent(user.id, 'agb', data.consentVersion ?? '1.0', data.registrationIp)
    await recordConsent(user.id, 'privacy_policy', data.consentVersion ?? '1.0', data.registrationIp)
  }

  // Send OTP for email + phone
  const emailOtp = await createOtp(user.id, 'email')
  const phoneOtp = await createOtp(user.id, 'phone')

  await sendOtpEmail(user.email, emailOtp.code)
  await sendOtpSms(user.phone, phoneOtp.code)

  return user
}

export async function verifyEmailOtp(userId: string, code: string) {
  const result = await verifyOtp(userId, 'email', code)

  if (!result.valid) {
    await incrementOtpAttempts(userId, 'email', code)
    throw new Error(result.reason ?? 'OTP_INVALID')
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: true },
  })

  if (user.phoneVerified) {
    await prisma.user.update({
      where: { id: userId },
      data: { verificationStatus: 'PROFILE_COMPLETE' },
    })
  }

  return true
}

export async function verifyPhoneOtp(userId: string, code: string) {
  const result = await verifyOtp(userId, 'phone', code)

  if (!result.valid) {
    await incrementOtpAttempts(userId, 'phone', code)
    throw new Error(result.reason ?? 'OTP_INVALID')
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { phoneVerified: true },
  })

  if (user.emailVerified) {
    await prisma.user.update({
      where: { id: userId },
      data: { verificationStatus: 'PROFILE_COMPLETE' },
    })
  }

  return true
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } })

  if (!user) throw new Error('INVALID_CREDENTIALS')
  if (!user.isActive) throw new Error('ACCOUNT_SUSPENDED')

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) throw new Error('INVALID_CREDENTIALS')

  return user
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } })
}

export async function resendOtp(userId: string, type: 'email' | 'phone') {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('USER_NOT_FOUND')

  const otp = await createOtp(userId, type)

  if (type === 'email') {
    await sendOtpEmail(user.email, otp.code)
  } else {
    await sendOtpSms(user.phone, otp.code)
  }
}

const PASSWORD_RESET_EXPIRES_MS = 60 * 60 * 1000 // 1 hour, single-use

export async function initiatePasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return // Don't reveal if email exists

  // Invalidate any earlier unused reset tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  })

  const token = randomBytes(32).toString('hex')
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRES_MS) },
  })

  const resetUrl = `ichhabezeit://reset-password?token=${token}`
  await sendPasswordResetEmail(user.email, resetUrl)
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } })
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    throw new Error('INVALID_OR_EXPIRED_TOKEN')
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    prisma.session.updateMany({
      where: { userId: resetToken.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ])
}

export interface CreateSessionOptions {
  deviceInfo?: string
  ipAddress?: string
  expiresAt?: Date
  deviceId?: string
  isTrusted?: boolean
  trustedUntil?: Date
}

export async function createSession(userId: string, token: string, opts: CreateSessionOptions = {}) {
  return prisma.session.create({
    data: {
      userId,
      token,
      deviceInfo: opts.deviceInfo,
      ipAddress: opts.ipAddress,
      deviceId: opts.deviceId,
      isTrusted: opts.isTrusted ?? false,
      trustedUntil: opts.trustedUntil,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })
}

// ─── New-device detection & trust ─────────────────────────────────────────────

const DEVICE_TRUST_DAYS = 30

export async function isKnownDevice(userId: string, deviceId: string): Promise<boolean> {
  const existing = await prisma.session.findFirst({ where: { userId, deviceId } })
  return !!existing
}

export async function isTrustedDevice(userId: string, deviceId: string): Promise<boolean> {
  const trusted = await prisma.session.findFirst({
    where: { userId, deviceId, isTrusted: true, trustedUntil: { gt: new Date() } },
  })
  return !!trusted
}

export async function sendDeviceChallengeOtp(userId: string, email: string) {
  const otp = await createOtp(userId, 'email')
  await sendNewDeviceOtpEmail(email, otp.code)
}

export async function verifyDeviceChallengeOtp(userId: string, code: string) {
  const result = await verifyOtp(userId, 'email', code)
  if (!result.valid) {
    await incrementOtpAttempts(userId, 'email', code)
    throw new Error(result.reason ?? 'INVALID_CODE')
  }
}

export async function revokeAllSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

// ─── MFA (TOTP) ─────────────────────────────────────────────────────────────

export async function startMfaSetup(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('USER_NOT_FOUND')

  const secret = generateTotpSecret()
  await prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret } })

  return {
    secret,
    otpauthUri: generateTotpUri(secret, user.email),
  }
}

export async function confirmMfaSetup(userId: string, token: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('USER_NOT_FOUND')
  if (!user.mfaSecret) throw new Error('MFA_SETUP_NOT_STARTED')

  if (!verifyTotpToken(user.mfaSecret, token)) throw new Error('INVALID_CODE')

  const recoveryCodes = generateRecoveryCodes()
  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: true,
      mfaRecoveryCodes: recoveryCodes.map(hashRecoveryCode),
    },
  })

  return { recoveryCodes }
}

export async function disableMfa(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('USER_NOT_FOUND')

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) throw new Error('INVALID_CREDENTIALS')

  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: [] },
  })
}

// Verifies a TOTP code or, failing that, a one-time recovery code (which is
// consumed on use). Returns true and — if a recovery code was used — updates
// the user's remaining code list as a side effect.
export async function verifyMfaLogin(userId: string, code: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !user.mfaEnabled || !user.mfaSecret) throw new Error('MFA_NOT_ENABLED')

  if (verifyTotpToken(user.mfaSecret, code)) return true

  const codeHash = hashRecoveryCode(code)
  if (user.mfaRecoveryCodes.includes(codeHash)) {
    await prisma.user.update({
      where: { id: userId },
      data: { mfaRecoveryCodes: user.mfaRecoveryCodes.filter((c) => c !== codeHash) },
    })
    return true
  }

  return false
}
