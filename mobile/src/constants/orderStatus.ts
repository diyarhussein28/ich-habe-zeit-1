// Single source of truth for what counts as "active" vs "history" across the
// app (home screens, Aufträge/Buchungen tabs) so the two never drift apart.
// ServiceRequest reuses this same status enum, so OPEN/OFFER_RECEIVED (a
// request still waiting for/reviewing offers, before any Order exists) count
// as active too — an actual Order row never has those two statuses, so
// including them here is a no-op for the pure-Order screens.
export const ACTIVE_ORDER_STATUSES = [
  'OPEN',
  'OFFER_RECEIVED',
  'AWAITING_PAYMENT',
  'IN_PROGRESS',
  'COMPLETED_BY_PROVIDER',
  'AWAITING_RELEASE',
  'DISPUTED',
]

export const HISTORY_ORDER_STATUSES = [
  'RELEASED',
  'PARTIALLY_RELEASED',
  'REFUNDED',
  'CANCELLED',
  'EXPIRED',
]

export function isActiveOrderStatus(status: string): boolean {
  return ACTIVE_ORDER_STATUSES.includes(status)
}
