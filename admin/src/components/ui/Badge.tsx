import { cn } from '@/lib/utils'

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const variantClass: Record<Variant, string> = {
  default:  'bg-brand-100 text-brand-700',
  success:  'bg-green-100 text-green-700',
  warning:  'bg-amber-100 text-amber-700',
  danger:   'bg-red-100 text-red-700',
  info:     'bg-sky-100 text-sky-700',
  neutral:  'bg-gray-100 text-gray-600',
}

export function Badge({ label, variant = 'default', className }: { label: string; variant?: Variant; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', variantClass[variant], className)}>
      {label}
    </span>
  )
}

// ── Domain helpers ──────────────────────────────────────────────────────────

export function KycBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: Variant }> = {
    REGISTERED:       { label: 'Nicht verifiziert', variant: 'neutral' },
    PROFILE_COMPLETE: { label: 'Profil vollständig', variant: 'info' },
    KYC_PENDING:      { label: 'KYC ausstehend', variant: 'warning' },
    KYC_VERIFIED:     { label: 'Verifiziert', variant: 'success' },
    KYC_REJECTED:     { label: 'Abgelehnt', variant: 'danger' },
    KYC_RESUBMISSION: { label: 'Erneute Einreichung', variant: 'warning' },
    PAYOUT_RESTRICTED:{ label: 'Auszahlung gesperrt', variant: 'danger' },
    SUSPENDED:        { label: 'Gesperrt', variant: 'danger' },
  }
  const cfg = map[status] ?? { label: status, variant: 'neutral' as Variant }
  return <Badge label={cfg.label} variant={cfg.variant} />
}

export function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: Variant }> = {
    DRAFT:                { label: 'Entwurf', variant: 'neutral' },
    OPEN:                 { label: 'Offen', variant: 'info' },
    OFFER_RECEIVED:       { label: 'Angebote', variant: 'warning' },
    AWAITING_PAYMENT:     { label: 'Zahlung ausstehend', variant: 'warning' },
    IN_PROGRESS:          { label: 'Aktiv', variant: 'default' },
    COMPLETED_BY_PROVIDER:{ label: 'Abgezeichnet', variant: 'success' },
    AWAITING_RELEASE:     { label: 'Freigabe', variant: 'warning' },
    RELEASED:             { label: 'Ausgezahlt', variant: 'success' },
    DISPUTED:             { label: 'Streitfall', variant: 'danger' },
    REFUNDED:             { label: 'Erstattet', variant: 'neutral' },
    CANCELLED:            { label: 'Abgebrochen', variant: 'neutral' },
    EXPIRED:              { label: 'Abgelaufen', variant: 'neutral' },
  }
  const cfg = map[status] ?? { label: status, variant: 'neutral' as Variant }
  return <Badge label={cfg.label} variant={cfg.variant} />
}

export function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; variant: Variant }> = {
    CUSTOMER:  { label: 'Auftraggeber', variant: 'info' },
    PROVIDER:  { label: 'Dienstleister', variant: 'default' },
    ADMIN:     { label: 'Admin', variant: 'danger' },
    HELP_DESK: { label: 'Support', variant: 'warning' },
  }
  const cfg = map[role] ?? { label: role, variant: 'neutral' as Variant }
  return <Badge label={cfg.label} variant={cfg.variant} />
}
