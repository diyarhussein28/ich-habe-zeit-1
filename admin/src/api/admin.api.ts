import { api } from './client'
import type {
  AdminStats, AdminUser, AdminUserDetail, AdminServiceArea, AdminOrder, AdminDispute,
  Category, CategoryCustomField, CommissionRate, LegalDoc, KycDocument,
  VerificationStatus, DisputeOutcome, PaginatedResponse,
  SupportTicket, SupportMessage, TicketStatus,
  AdminReport, AdminTransaction, FraudSignals,
  BlacklistEntry, BlacklistIdentifierType, BannedEntity, BanType,
  FlaggedContent, ModerationStatus, PlatformSetting, AuditLogEntry,
  PendingCategoryVerification,
} from './types'

export const adminApi = {
  // ── Stats ──────────────────────────────────────────────────────────────
  getStats: () =>
    api.get<AdminStats>('/api/admin/stats'),

  // ── Users ──────────────────────────────────────────────────────────────
  getUsers: (params?: { page?: number; limit?: number; role?: string; verificationStatus?: string; search?: string }) =>
    api.get<PaginatedResponse<AdminUser>>('/api/admin/users', { params }),

  getUser: (id: string) =>
    api.get<{ user: AdminUserDetail }>(`/api/admin/users/${id}`),

  updateProviderServiceAreas: (userId: string, areas: Array<{ homePlz: string; radiusKm: number }>) =>
    api.patch<{ areas: AdminServiceArea[] }>(`/api/admin/providers/${userId}/service-areas`, { areas }),

  updateProviderTaxInfo: (userId: string, data: { isKleinunternehmer: boolean; legalName: string; vatNumber?: string; taxId?: string }) =>
    api.patch(`/api/admin/providers/${userId}/tax-info`, data),

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
    api.get<{ dispute: AdminDispute }>(`/api/admin/disputes/${id}`),

  assignDispute: (id: string, assignedToId: string) =>
    api.patch<{ dispute: AdminDispute }>(`/api/admin/disputes/${id}/assign`, { assignedToId }),

  recommendDispute: (id: string, recommendation: DisputeOutcome, note: string) =>
    api.patch<{ dispute: AdminDispute }>(`/api/admin/disputes/${id}/recommend`, { recommendation, note }),

  resolveDispute: (id: string, outcome: DisputeOutcome, resolutionNote: string, releasedAmount?: number) =>
    api.post<{ dispute: AdminDispute }>(`/api/admin/disputes/${id}/resolve`, { outcome, resolutionNote, releasedAmount }),

  // ── Categories ─────────────────────────────────────────────────────────
  getCategories: () =>
    api.get<Category[]>('/api/admin/categories'),

  createCategory: (data: {
    name: string; icon?: string; parentId?: string; description?: string
    commissionRate?: number; geoRestrictions?: string[]; customFields?: CategoryCustomField[]
    requiredVerificationDocTypes?: string[]; reducedVatEligible?: boolean; sortOrder?: number
  }) =>
    api.post<Category>('/api/admin/categories', data),

  updateCategory: (id: string, data: Partial<{
    name: string; icon: string; isActive: boolean; commissionRate: number
    geoRestrictions: string[]; customFields: CategoryCustomField[]
    requiredVerificationDocTypes: string[]; reducedVatEligible: boolean; sortOrder: number
  }>) =>
    api.patch<Category>(`/api/admin/categories/${id}`, data),

  deleteCategory: (id: string) =>
    api.delete(`/api/admin/categories/${id}`),

  // ── Provider category verification queue ──────────────────────────────
  getPendingCategoryVerifications: () =>
    api.get<{ items: PendingCategoryVerification[] }>('/api/admin/providers/pending-category-verification'),

  reviewCategoryVerification: (userId: string, categoryId: string, isVerified: boolean) =>
    api.patch(`/api/admin/providers/${userId}/categories/${categoryId}/verify`, { isVerified }),

  // ── Reports & Transaction Monitor ───────────────────────────────────────
  getReports: (params?: { from?: string; to?: string }) =>
    api.get<AdminReport>('/api/admin/reports', { params }),

  getTransactions: (params?: { status?: string; limit?: number; offset?: number }) =>
    api.get<{ total: number; transactions: AdminTransaction[]; fraudSignals: FraudSignals }>('/api/admin/transactions', { params }),

  // ── Moderation: blacklist ───────────────────────────────────────────────
  getBlacklist: () =>
    api.get<{ entries: BlacklistEntry[] }>('/api/admin/moderation/blacklist'),

  addToBlacklist: (identifierType: BlacklistIdentifierType, identifierValue: string, reason: string) =>
    api.post<{ entry: BlacklistEntry }>('/api/admin/moderation/blacklist', { identifierType, identifierValue, reason }),

  removeFromBlacklist: (id: string) =>
    api.delete(`/api/admin/moderation/blacklist/${id}`),

  // ── Moderation: bans ─────────────────────────────────────────────────────
  getBans: () =>
    api.get<{ bans: BannedEntity[] }>('/api/admin/moderation/bans'),

  addBan: (type: BanType, value: string, reason: string) =>
    api.post<{ ban: BannedEntity }>('/api/admin/moderation/bans', { type, value, reason }),

  removeBan: (id: string) =>
    api.delete(`/api/admin/moderation/bans/${id}`),

  // ── Moderation: content review queue ────────────────────────────────────
  getModerationQueue: (status?: ModerationStatus) =>
    api.get<{ items: FlaggedContent[] }>('/api/admin/moderation/content', { params: { status } }),

  reviewContent: (id: string, status: 'APPROVED' | 'REJECTED', reviewNote?: string) =>
    api.patch(`/api/admin/moderation/content/${id}`, { status, reviewNote }),

  // ── Platform settings ────────────────────────────────────────────────────
  getSettings: () =>
    api.get<{ settings: PlatformSetting[] }>('/api/admin/settings'),

  updateSetting: (key: string, value: unknown) =>
    api.patch<{ setting: PlatformSetting }>(`/api/admin/settings/${key}`, { value }),

  // ── Audit log ─────────────────────────────────────────────────────────────
  getAuditLogs: (params?: { userId?: string; actionType?: string; page?: number; limit?: number }) =>
    api.get<{ total: number; logs: AuditLogEntry[] }>('/api/admin/audit-logs', { params }),

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
