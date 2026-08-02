import bcrypt from 'bcryptjs'
import { prisma } from '../config/prisma.js'
import { createOtp, verifyOtp, incrementOtpAttempts } from './otp.service.js'
import { sendOtpEmail, sendOtpSms } from './notification.service.js'
import type { UserRole } from '@prisma/client'

export async function registerUser(data: {
  email: string
  phone: string
  password: string
  displayName: string
  role: UserRole
}) {
  const existingEmail = await prisma.user.findUnique({ where: { email: data.email } })
  if (existingEmail) throw new Error('EMAIL_TAKEN')

  const existingPhone = await prisma.user.findUnique({ where: { phone: data.phone } })
  if (existingPhone) throw new Error('PHONE_TAKEN')

  const passwordHash = await bcrypt.hash(data.password, 12)

  const user = await prisma.user.create({
    data: {
      email: data.email,
      phone: data.phone,
      passwordHash,
      role: data.role,
      displayName: data.displayName,
      notificationSettings: { create: {} },
    },
  })

  if (data.role === 'CUSTOMER') {
    await prisma.customerProfile.create({ data: { userId: user.id } })
  } else if (data.role === 'PROVIDER') {
    await prisma.providerProfile.create({ data: { userId: user.id } })
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

export async function initiatePasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return // Don't reveal if email exists

  const otp = await createOtp(user.id, 'email')
  // In production, send a reset link with the OTP embedded
  await sendOtpEmail(
    user.email,
    `Passwort zurücksetzen — Ihr Code: ${otp.code} (gültig 10 Minuten)`
  )
}

export async function resetPassword(userId: string, code: string, newPassword: string) {
  const result = await verifyOtp(userId, 'email', code)
  if (!result.valid) throw new Error(result.reason ?? 'OTP_INVALID')

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })

  // Revoke all active sessions
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function createSession(
  userId: string,
  token: string,
  deviceInfo?: string,
  ipAddress?: string,
  expiresAt?: Date
) {
  return prisma.session.create({
    data: {
      userId,
      token,
      deviceInfo,
      ipAddress,
      expiresAt: expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })
}

export async function revokeAllSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
