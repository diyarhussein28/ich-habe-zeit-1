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
  dailyGmv: number
  kycQueueSize: number
}

export interface AdminReport {
  period: { from: string; to: string }
  gmv: number
  platformRevenue: number
  orderVolume: number
  completedOrderVolume: number
  averageOrderValue: number
  conversionRate: number
  disputeRate: number
  autoReleaseRate: number
  providerActivationRate: number
  avgKycQueueHours: number
  categoryPerformance: Array<{ categoryId: string; name: string; gmv: number; orders: number; disputes: number }>
  cityPerformance: Array<{ city: string; gmv: number; orders: number }>
}

export interface AdminTransaction {
  id: string
  status: OrderStatus
  paymentStatus: string
  grossAmount: number
  commissionAmount: number
  netProviderAmount: number
  releasedAmount?: number
  refundedAmount?: number
  stripePaymentIntentId?: string
  stripeTransferId?: string
  stripePayoutId?: string
  createdAt: string
  updatedAt: string
  customer: { id: string; displayName: string; email: string }
  provider: { id: string; displayName: string }
  isFlaggedForFraud: boolean
}

export interface FraudSignals {
  repeatedFailedPaymentUserIds: string[]
  highDisputeProviderIds: string[]
}

export type BlacklistIdentifierType = 'EMAIL' | 'PHONE' | 'DEVICE_ID' | 'DOCUMENT_HASH'
export type BanType = 'IP' | 'DEVICE'

export interface BlacklistEntry {
  id: string
  identifierType: BlacklistIdentifierType
  identifierValue: string
  reason: string
  createdAt: string
}

export interface BannedEntity {
  id: string
  type: BanType
  value: string
  reason: string
  createdAt: string
}

export type ModerationContentType = 'PROFILE_PHOTO' | 'SERVICE_PHOTO' | 'REQUEST_PHOTO' | 'COMPLETION_PHOTO'
export type ModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface FlaggedContent {
  id: string
  contentType: ModerationContentType
  contentUrl: string
  ownerId: string
  status: ModerationStatus
  reviewedById?: string
  reviewedAt?: string
  reviewNote?: string
  createdAt: string
}

export interface PlatformSetting {
  key: string
  value: unknown
  isOverridden: boolean
}

export interface AuditLogEntry {
  id: string
  userId?: string
  targetUserId?: string
  actionType: string
  targetEntity?: string
  targetId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  createdAt: string
  user?: { id: string; displayName: string; email: string; role: string }
  targetUser?: { id: string; displayName: string; email: string }
}

export interface PendingCategoryVerification {
  id: string
  categoryId: string
  isVerified: boolean
  verificationDocUrls: string[]
  category: { id: string; name: string }
  providerProfile: { user: { id: string; displayName: string; email: string } }
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

export interface AdminServiceArea {
  id: string
  homePlz: string
  radiusKm: number
  plzList: string[]
}

export interface AdminUserDetail extends Omit<AdminUser, 'providerProfile'> {
  providerProfile?: {
    id: string
    averageRating: number
    totalReviews: number
    isKleinunternehmer: boolean
    bio?: string
    legalName?: string
    vatNumber?: string
    taxId?: string
    stripeConnectAccountId?: string
    stripeConnectEnabled: boolean
    serviceAreas: AdminServiceArea[]
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

export type DisputeStatus = 'OPEN' | 'IN_REVIEW' | 'PENDING_DECISION' | 'RESOLVED' | 'ESCALATED'

export interface AdminDispute {
  id: string
  orderId: string
  status: DisputeStatus
  reasonCategory: string
  description: string
  intakeAnswers?: { key: string; question: string; answer: string }[]
  respondedById?: string
  responseAgreesWithClaim?: boolean
  responseDescription?: string
  respondedAt?: string
  assignedToId?: string
  internalNote?: string
  recommendation?: DisputeOutcome
  resolutionNote?: string
  outcome?: DisputeOutcome
  createdAt: string
  resolvedAt?: string
  order: AdminOrder
  evidence?: Array<{
    id: string
    fileUrl: string
    fileName: string
    side: string
    createdAt: string
  }>
}

export interface CategoryCustomField {
  key: string
  label: string
  type: 'text' | 'number' | 'select' | 'boolean'
  required?: boolean
  options?: string[]
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
  geoRestrictions: string[]
  customFields?: CategoryCustomField[]
  requiredVerificationDocTypes: string[]
  reducedVatEligible: boolean
  sortOrder: number
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
