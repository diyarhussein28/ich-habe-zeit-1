// Single source of truth for what counts as "active" vs "history" across the
// app (home screens, Aufträge/Buchungen tabs) so the two never drift apart.
export const ACTIVE_ORDER_STATUSES = [
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
