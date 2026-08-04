import { api } from './client'
import type {
  AdminStats, AdminUser, AdminOrder, AdminDispute,
  Category, CommissionRate, LegalDoc, KycDocument,
  VerificationStatus, DisputeOutcome, PaginatedResponse,
  SupportTicket, SupportMessage, TicketStatus,
} from './types'

export const adminApi = {
  // ── Stats ──────────────────────────────────────────────────────────────
  getStats: () =>
    api.get<AdminStats>('/api/admin/stats'),

  // ── Users ──────────────────────────────────────────────────────────────
  getUsers: (params?: { page?: number; limit?: number; role?: string; verificationStatus?: string; search?: string }) =>
    api.get<PaginatedResponse<AdminUser>>('/api/admin/users', { params }),

  getUser: (id: string) =>
    api.get<AdminUser>(`/api/admin/users/${id}`),

  updateKyc: (id: string, status: VerificationStatus, notes?: string) =>
    api.patch<AdminUser>(`/api/admin/users/${id}/kyc`, { status, notes }),

  suspendUser: (id: string, suspended: boolean) =>
    api.patch<AdminUser>(`/api/admin/users/${id}/suspend`, { suspended }),

  changeRole: (id: string, role: 'CUSTOMER' | 'PROVIDER') =>
    api.patch<{ user: AdminUser }>(`/api/admin/users/${id}/role`, { role }),

  getUserKycDocuments: (id: string) =>
    api.get<{ documents: KycDocument[] }>(`/api/admin/users/${id}/kyc-documents`),

  getKycDocumentFileUrl: (documentId: string) =>
    api.get(`/api/kyc/documents/${documentId}/file`, { responseType: 'blob' })
      .then((res) => URL.createObjectURL(res.data as Blob)),

  // ── Orders ─────────────────────────────────────────────────────────────
  getOrders: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get<PaginatedResponse<AdminOrder>>('/api/admin/orders', { params }),

  // ── Disputes ───────────────────────────────────────────────────────────
  getDisputes: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get<PaginatedResponse<AdminDispute>>('/api/admin/disputes', { params }),

  getDispute: (id: string) =>
    api.get<AdminDispute>(`/api/admin/disputes/${id}`),

  resolveDispute: (id: string, outcome: DisputeOutcome, notes: string, providerAmount?: number) =>
    api.post<AdminDispute>(`/api/admin/disputes/${id}/resolve`, { outcome, notes, providerAmount }),

  // ── Categories ─────────────────────────────────────────────────────────
  getCategories: () =>
    api.get<Category[]>('/api/admin/categories'),

  createCategory: (data: { name: string; icon?: string; parentId?: string; description?: string }) =>
    api.post<Category>('/api/admin/categories', data),

  updateCategory: (id: string, data: Partial<{ name: string; icon: string; isActive: boolean; commissionRate: number }>) =>
    api.patch<Category>(`/api/admin/categories/${id}`, data),

  deleteCategory: (id: string) =>
    api.delete(`/api/admin/categories/${id}`),

  // ── Commission rates ───────────────────────────────────────────────────
  getCommissionRates: () =>
    api.get<CommissionRate[]>('/api/admin/commission-rates'),

  createCommissionRate: (data: { scope: 'GLOBAL' | 'CATEGORY' | 'CITY'; categoryId?: string; city?: string; rate: number }) =>
    api.post<CommissionRate>('/api/admin/commission-rates', data),

  updateCommissionRate: (id: string, rate: number) =>
    api.patch<CommissionRate>(`/api/admin/commission-rates/${id}`, { rate }),

  deleteCommissionRate: (id: string) =>
    api.delete(`/api/admin/commission-rates/${id}`),

  // ── Support tickets ────────────────────────────────────────────────────
  getSupportTickets: (params?: { status?: string; assignedToId?: string; page?: number; limit?: number }) =>
    api.get<PaginatedResponse<SupportTicket>>('/api/admin/support-tickets', { params }),

  getSupportTicket: (id: string) =>
    api.get<{ ticket: SupportTicket }>(`/api/admin/support-tickets/${id}`),

  sendSupportTicketMessage: (id: string, content: string, isInternal?: boolean) =>
    api.post<{ message: SupportMessage }>(`/api/admin/support-tickets/${id}/messages`, { content, isInternal }),

  assignSupportTicket: (id: string, assignedToId: string) =>
    api.patch<{ ticket: SupportTicket }>(`/api/admin/support-tickets/${id}/assign`, { assignedToId }),

  updateSupportTicketStatus: (id: string, status: TicketStatus) =>
    api.patch<{ ticket: SupportTicket }>(`/api/admin/support-tickets/${id}/status`, { status }),

  // ── Legal docs ─────────────────────────────────────────────────────────
  getLegalDocs: () =>
    api.get<LegalDoc[]>('/api/admin/legal-docs'),

  updateLegalDoc: (type: string, content: string) =>
    api.patch<LegalDoc>(`/api/admin/legal-docs/${type}`, { content }),
}

// Public auth (same login endpoint)
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: AdminUser } | { mfaRequired: true; challengeToken: string }>(
      '/api/auth/login',
      { email, password },
    ),

  mfaChallenge: (challengeToken: string, token: string) =>
    api.post<{ token: string; user: AdminUser }>('/api/auth/mfa/challenge', { challengeToken, token }),

  logout: () =>
    api.post('/api/auth/logout'),

  // ── MFA management (for the currently logged-in account) ─────────────────
  mfaSetup: () =>
    api.post<{ secret: string; otpauthUri: string }>('/api/auth/mfa/setup'),

  mfaVerifySetup: (token: string) =>
    api.post<{ recoveryCodes: string[] }>('/api/auth/mfa/verify-setup', { token }),

  mfaDisable: (password: string) =>
    api.post<{ message: string }>('/api/auth/mfa/disable', { password }),
}
