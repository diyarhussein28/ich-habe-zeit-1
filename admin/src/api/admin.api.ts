import { api } from './client'
import type {
  AdminStats, AdminUser, AdminOrder, AdminDispute,
  Category, CommissionRate, LegalDoc,
  VerificationStatus, DisputeOutcome, PaginatedResponse,
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

  // ── Legal docs ─────────────────────────────────────────────────────────
  getLegalDocs: () =>
    api.get<LegalDoc[]>('/api/admin/legal-docs'),

  updateLegalDoc: (type: string, content: string) =>
    api.patch<LegalDoc>(`/api/admin/legal-docs/${type}`, { content }),
}

// Public auth (same login endpoint)
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: AdminUser }>('/api/auth/login', { email, password }),

  logout: () =>
    api.post('/api/auth/logout'),
}
