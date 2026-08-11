export type UserRole = 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | 'HELP_DESK'

export type VerificationStatus =
  | 'REGISTERED'
  | 'PROFILE_COMPLETE'
  | 'KYC_PENDING'
  | 'KYC_VERIFIED'
  | 'KYC_REJECTED'
  | 'KYC_RESUBMISSION'
  | 'PAYOUT_RESTRICTED'
  | 'SUSPENDED'

export type RequestStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'OFFER_RECEIVED'
  | 'AWAITING_PAYMENT'
  | 'IN_PROGRESS'
  | 'COMPLETED_BY_PROVIDER'
  | 'AWAITING_RELEASE'
  | 'RELEASED'
  | 'DISPUTED'
  | 'REFUNDED'
  | 'PARTIALLY_RELEASED'
  | 'CANCELLED'
  | 'EXPIRED'

export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED'

export type OrderStatus =
  | 'AWAITING_PAYMENT'
  | 'IN_PROGRESS'
  | 'COMPLETED_BY_PROVIDER'
  | 'AWAITING_RELEASE'
  | 'RELEASED'
  | 'DISPUTED'
  | 'REFUNDED'
  | 'PARTIALLY_RELEASED'
  | 'CANCELLED'

export interface User {
  id: string
  email: string
  phone?: string
  displayName: string
  role: UserRole
  emailVerified: boolean
  phoneVerified: boolean
  verificationStatus: VerificationStatus
  profileImageUrl?: string
  dateOfBirth?: string
  createdAt?: string
}

export interface ServiceCategory {
  id: string
  name: string
  description?: string
  icon?: string
  parentId?: string
  children?: ServiceCategory[]
}

export interface ServiceRequest {
  id: string
  customerId: string
  customer?: {
    id: string
    averageRating: number
    totalReviews: number
    user: Partial<User>
  }
  categoryId: string
  category?: ServiceCategory
  title: string
  description: string
  plz: string
  city?: string
  addressCity?: string
  scheduledAt?: string
  preferredDateStart?: string
  budget?: number
  budgetMin?: number
  budgetMax?: number
  status: RequestStatus
  createdAt: string
  updatedAt: string
  _count?: { offers: number }
}

export interface ProviderProfile {
  id: string
  userId: string
  user?: Partial<User>
  bio?: string
  averageRating: number
  totalReviews: number
  isKleinunternehmer: boolean
  serviceAreas?: { plz: string; city: string }[]
}

export interface Offer {
  id: string
  requestId: string
  providerId: string
  provider?: ProviderProfile & { user: Partial<User> }
  price?: number
  proposedPrice?: number
  message?: string
  scopeOfWork?: string
  validUntil: string
  status: OfferStatus
  createdAt: string
  request?: Partial<ServiceRequest>
}

export interface Order {
  id: string
  requestId: string
  offerId: string
  customerId: string
  providerId: string
  status: OrderStatus
  totalAmount?: number
  grossAmount?: number
  platformFee?: number
  commissionAmount?: number
  providerAmount?: number
  netProviderAmount?: number
  releasedAmount?: number
  releaseDeadline?: string
  completedAt?: string
  releasedAt?: string
  createdAt: string
  updatedAt: string
  request?: ServiceRequest
  offer?: Offer
}

export type DisputeStatus = 'OPEN' | 'IN_REVIEW' | 'PENDING_DECISION' | 'RESOLVED' | 'ESCALATED'
export type DisputeOutcome = 'FULL_RELEASE' | 'PARTIAL_RELEASE' | 'FULL_REFUND' | 'REWORK_AGREEMENT' | 'ESCALATED'

export interface DisputeEvidence {
  id: string
  side: 'customer' | 'provider'
  uploadedById: string
  fileUrl: string
  fileName: string
  fileType: string
  fileSizeBytes: number
  createdAt: string
}

export interface Dispute {
  id: string
  orderId: string
  openedById: string
  status: DisputeStatus
  reasonCategory: string
  description: string
  intakeAnswers?: { key: string; question: string; answer: string }[]
  evidence: DisputeEvidence[]
  respondedById?: string
  responseAgreesWithClaim?: boolean
  responseDescription?: string
  respondedAt?: string
  outcome?: DisputeOutcome
  resolvedById?: string
  resolvedAt?: string
  resolutionNote?: string
  createdAt: string
  updatedAt: string
  order?: Order
}

export interface ChatMessage {
  id: string
  chatId: string
  senderId: string
  senderType: 'customer' | 'provider' | 'system'
  content: string
  isSystemMessage: boolean
  createdAt: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export interface ApiError {
  statusCode: number
  error: string
  message: string
}
