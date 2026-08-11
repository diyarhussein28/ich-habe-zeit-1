import { apiClient } from './client'
import type { Dispute } from './types'
import type { DisputeAnswer } from '../constants/disputeFlow'

export const disputesApi = {
  get: (orderId: string) =>
    apiClient.get<{ dispute: Dispute }>(`/api/orders/${orderId}/dispute`),

  open: (orderId: string, reasonCategory: string, description: string, intakeAnswers?: DisputeAnswer[]) =>
    apiClient.post<{ dispute: Dispute }>(`/api/orders/${orderId}/dispute`, { reasonCategory, description, intakeAnswers }),

  addEvidence: (orderId: string, file: { fileUrl: string; fileName: string; fileType: string; fileSizeBytes: number }) =>
    apiClient.post<{ dispute: Dispute }>(`/api/orders/${orderId}/dispute/evidence`, file),

  respond: (orderId: string, agrees: boolean, description: string) =>
    apiClient.post<{ dispute: Dispute }>(`/api/orders/${orderId}/dispute/respond`, { agrees, description }),
}

// Covers reasonCategory values from both the customer and provider intake
// trees (mobile/src/constants/disputeFlow.ts) plus the chargeback auto-open path.
export const DISPUTE_REASON_CATEGORY_LABEL: Record<string, string> = {
  NOT_COMPLETED: 'Auftrag nicht abgeschlossen',
  NOT_AS_AGREED: 'Arbeit entspricht nicht der Vereinbarung',
  DAMAGE: 'Schaden entstanden',
  NO_SHOW: 'Gegenseite nicht erschienen',
  PAYMENT_ISSUE: 'Zahlungsproblem',
  COULD_NOT_COMPLETE: 'Auftrag konnte nicht abgeschlossen werden',
  CUSTOMER_UNRESPONSIVE: 'Auftraggeber reagiert nicht mehr',
  SCOPE_DISPUTE: 'Auftraggeber verlangt mehr als vereinbart',
  UNFAIR_CANCELLATION: 'Ungerechtfertigte Stornierung',
  CHARGEBACK: 'Rückbuchung (Chargeback)',
  OTHER: 'Sonstiges',
}

export const DISPUTE_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Eröffnet',
  IN_REVIEW: 'In Prüfung',
  PENDING_DECISION: 'Entscheidung ausstehend',
  RESOLVED: 'Abgeschlossen',
  ESCALATED: 'Weitergeleitet',
}

export const DISPUTE_OUTCOME_LABEL: Record<string, string> = {
  FULL_RELEASE: 'Volle Auszahlung an Dienstleister',
  PARTIAL_RELEASE: 'Teilweise Auszahlung',
  FULL_REFUND: 'Volle Rückerstattung an Auftraggeber',
  REWORK_AGREEMENT: 'Nachbesserung vereinbart',
  ESCALATED: 'An Schlichtungsstelle weitergeleitet',
}
