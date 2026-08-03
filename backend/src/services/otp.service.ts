import { prisma } from '../config/prisma.js'
import { env } from '../config/env.js'
import { randomInt } from 'crypto'

export function generateOtpCode(): string {
  return randomInt(100000, 999999).toString()
}

export async function createOtp(userId: string, type: 'email' | 'phone' | 'mfa_setup') {
  // Invalidate existing unused OTPs of this type
  await prisma.otpCode.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() },
  })

  const code = generateOtpCode()
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRES_IN_MINUTES * 60 * 1000)

  const otp = await prisma.otpCode.create({
    data: { userId, type, code, expiresAt },
  })

  return { code, expiresAt, otpId: otp.id }
}

export async function verifyOtp(
  userId: string,
  type: 'email' | 'phone' | 'mfa_setup',
  code: string
): Promise<{ valid: boolean; reason?: string }> {
  const otp = await prisma.otpCode.findFirst({
    where: { userId, type, code, usedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!otp) return { valid: false, reason: 'INVALID_CODE' }

  if (otp.attempts >= env.OTP_MAX_RETRIES) {
    return { valid: false, reason: 'MAX_RETRIES_EXCEEDED' }
  }

  if (otp.expiresAt < new Date()) {
    return { valid: false, reason: 'CODE_EXPIRED' }
  }

  // Mark as used
  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  })

  return { valid: true }
}

export async function incrementOtpAttempts(userId: string, type: string, code: string) {
  await prisma.otpCode.updateMany({
    where: { userId, type, code, usedAt: null },
    data: { attempts: { increment: 1 } },
  })
}
