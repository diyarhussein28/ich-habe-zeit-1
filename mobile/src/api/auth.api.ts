import { apiClient } from './client'
import type { User, UserRole } from './types'

export interface RegisterPayload {
  email: string
  phone: string
  password: string
  displayName: string
  role: Extract<UserRole, 'CUSTOMER' | 'PROVIDER'>
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

export interface MessageResponse {
  message: string
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    apiClient.post<MessageResponse>('/api/auth/register', payload),

  verifyEmail: (payload: OtpVerifyPayload) =>
    apiClient.post<MessageResponse>('/api/auth/verify/email', payload),

  verifyPhone: (payload: OtpVerifyPayload) =>
    apiClient.post<AuthResponse>('/api/auth/verify/phone', payload),

  login: (payload: LoginPayload) =>
    apiClient.post<AuthResponse>('/api/auth/login', payload),

  logout: () =>
    apiClient.post<MessageResponse>('/api/auth/logout'),

  resendOtp: (payload: { identifier: string; type: 'email' | 'phone' }) =>
    apiClient.post<MessageResponse>('/api/auth/resend-otp', payload),

  forgotPassword: (email: string) =>
    apiClient.post<MessageResponse>('/api/auth/forgot-password', { email }),

  resetPassword: (payload: { token: string; newPassword: string }) =>
    apiClient.post<MessageResponse>('/api/auth/reset-password', payload),
}
