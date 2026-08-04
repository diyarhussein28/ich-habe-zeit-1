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
  | 'REWORK_AGREEMENT' | 'ESCALATED'

export type KycDocumentType = 'ID_FRONT' | 'ID_BACK' | 'SELFIE_WITH_ID'

export interface KycDocument {
  id: string
  type: KycDocumentType
  fileName: string
  mimeType: string
  status: 'UPLOADED' | 'APPROVED' | 'REJECTED' | 'RESUBMISSION_REQUIRED'
  createdAt: string
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'

export interface SupportTicketUser {
  id: string
  displayName: string
  email: string
  role?: UserRole
}

export interface SupportMessage {
  id: string
  ticketId: string
  senderId: string
  content: string
  isInternal: boolean
  createdAt: string
  sender?: SupportTicketUser | null
}

export interface SupportTicket {
  id: string
  userId: string
  subject: string
  description: string
  status: TicketStatus
  assignedToId: string | null
  orderId: string | null
  createdAt: string
  updatedAt: string
  user?: SupportTicketUser | null
  messages?: SupportMessage[]
}

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
