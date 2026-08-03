export type UserRole = 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | 'HELP_DESK'

export type VerificationStatus =
  | 'REGISTERED' | 'PROFILE_COMPLETE' | 'KYC_PENDING' | 'KYC_VERIFIED'
  | 'KYC_REJECTED' | 'KYC_RESUBMISSION' | 'PAYOUT_RESTRICTED' | 'SUSPENDED'

export type OrderStatus =
  | 'DRAFT' | 'OPEN' | 'OFFER_RECEIVED' | 'AWAITING_PAYMENT' | 'IN_PROGRESS'
  | 'COMPLETED_BY_PROVIDER' | 'AWAITING_RELEASE' | 'RELEASED' | 'DISPUTED'
  | 'REFUNDED' | 'PARTIALLY_RELEASED' | 'CANCELLED' | 'EXPIRED'

export type DisputeOutcome =
  | 'FULL_RELEASE' | 'FULL_REFUND' | 'PARTIAL_RELEASE'
  | 'CLOSE_IN_FAVOR_OF_CUSTOMER' | 'CLOSE_IN_FAVOR_OF_PROVIDER'

export interface AdminStats {
  totalUsers: number
  totalProviders: number
  totalCustomers: number
  totalOrders: number
  activeOrders: number
  totalRevenue: number
  openDisputes: number
  newUsersThisWeek: number
  newOrdersThisWeek: number
  revenueThisMonth: number
}

export interface AdminUser {
  id: string
  email: string
  phone: string
  displayName: string
  role: UserRole
  verificationStatus: VerificationStatus
  createdAt: string
  providerProfile?: {
    id: string
    averageRating: number
    totalReviews: number
    isKleinunternehmer: boolean
    bio?: string
  }
}

export interface AdminOrder {
  id: string
  status: OrderStatus
  totalAmount: number
  platformFee: number
  providerAmount: number
  createdAt: string
  updatedAt: string
  customer: Pick<AdminUser, 'id' | 'displayName' | 'email'>
  provider: Pick<AdminUser, 'id' | 'displayName' | 'email'>
  request: {
    id: string
    title: string
    city: string
    plz: string
    category?: { name: string }
  }
}

export interface AdminDispute {
  id: string
  orderId: string
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'CLOSED'
  reason: string
  resolution?: string
  outcome?: DisputeOutcome
  createdAt: string
  resolvedAt?: string
  order: AdminOrder
  evidence?: Array<{
    id: string
    fileUrl: string
    description?: string
    side: string
    createdAt: string
  }>
}

export interface Category {
  id: string
  name: string
  slug: string
  description?: string
  icon?: string
  parentId?: string
  parent?: { name: string }
  children?: Category[]
  isActive: boolean
  commissionRate?: number
}

export interface CommissionRate {
  id: string
  scope: 'GLOBAL' | 'CATEGORY' | 'CITY'
  categoryId?: string
  city?: string
  rate: number
  category?: { name: string }
  createdAt: string
}

export interface LegalDoc {
  id: string
  type: 'AGB' | 'DATENSCHUTZ' | 'IMPRESSUM'
  content: string
  updatedAt: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}
