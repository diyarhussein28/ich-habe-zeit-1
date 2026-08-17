import { apiClient } from './client'
import { getDeviceId } from '../utils/device'
import type { User, UserRole } from './types'

export interface RegisterPayload {
  email: string
  phone: string
  password: string
  displayName: string
  role: Extract<UserRole, 'CUSTOMER' | 'PROVIDER'>
  referralCode?: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface OtpVerifyPayload {
  code: string
  identifier: string
  type: 'email' | 'phone'
}

export interface AuthResponse {
  token: string
  user: User
}

export interface DeviceChallengeResponse {
  deviceChallengeRequired: true
  challengeToken: string
}

export interface MessageResponse {
  message: string
}

export const authApi = {
  register: async (payload: RegisterPayload) =>
    apiClient.post<MessageResponse>('/api/auth/register', { ...payload, deviceId: await getDeviceId() }),

  verifyEmail: (payload: OtpVerifyPayload) =>
    apiClient.post<MessageResponse>('/api/auth/verify/email', payload),

  verifyPhone: (payload: OtpVerifyPayload) =>
    apiClient.post<AuthResponse>('/api/auth/verify/phone', payload),

  login: async (payload: LoginPayload) =>
    apiClient.post<AuthResponse | DeviceChallengeResponse>('/api/auth/login', {
      ...payload,
      deviceId: await getDeviceId(),
    }),

  deviceChallenge: async (payload: { challengeToken: string; code: string; trustDevice?: boolean }) =>
    apiClient.post<AuthResponse>('/api/auth/device-challenge', payload),

  logout: () =>
    apiClient.post<MessageResponse>('/api/auth/logout'),

  resendOtp: (payload: { identifier: string; type: 'email' | 'phone' }) =>
    apiClient.post<MessageResponse>('/api/auth/resend-otp', payload),

  forgotPassword: (email: string) =>
    apiClient.post<MessageResponse>('/api/auth/forgot-password', { email }),

  resetPassword: (payload: { token: string; newPassword: string }) =>
    apiClient.post<MessageResponse>('/api/auth/reset-password', payload),
}
