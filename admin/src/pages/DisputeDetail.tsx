import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { adminApi } from '@/api/admin.api'
import { Badge, OrderStatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { formatDateTime, formatEur } from '@/lib/utils'
import { apiError } from '@/api/client'
import type { DisputeOutcome } from '@/api/types'

const OUTCOMES: { value: DisputeOutcome; label: string; desc: string; color: string }[] = [
  { value: 'FULL_RELEASE',                label: 'Volle Auszahlung',            desc: 'Gesamtbetrag an Dienstleister', color: 'btn-primary' },
  { value: 'FULL_REFUND',                 label: 'Volle Erstattung',            desc: 'Gesamtbetrag zurück an Kunden', color: 'btn-danger' },
  { value: 'PARTIAL_RELEASE',             label: 'Teillösung',                  desc: 'Aufteilung des Betrags',        color: 'btn-secondary' },
  { value: 'CLOSE_IN_FAVOR_OF_CUSTOMER',  label: 'Zugunsten Auftraggeber',      desc: 'Fall wird geschlossen',         color: 'btn-secondary' },
  { value: 'CLOSE_IN_FAVOR_OF_PROVIDER',  label: 'Zugunsten Dienstleister',     desc: 'Fall wird geschlossen',         color: 'btn-secondary' },
]

export default function DisputeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showResolve, setShowResolve] = useState(false)
  const [outcome, setOutcome] = useState<DisputeOutcome>('FULL_RELEASE')
  const [notes, setNotes] = useState('')
  const [providerAmount, setProviderAmount] = useState('')
  const [error, setError] = useState('')

  const { data: dispute, isLoading } = useQuery({
    queryKey: ['admin-dispute', id],
    queryFn: () => adminApi.getDispute(id!).then((r) => r.data),
    enabled: !!id,
  })

  const resolveMutation = useMutation({
    mutationFn: () =>
      adminApi.resolveDispute(
        id!,
        outcome,
        notes,
        outcome === 'PARTIAL_RELEASE' ? parseFloat(providerAmount) : undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-dispute', id] })
      qc.invalidateQueries({ queryKey: ['admin-disputes'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      setShowResolve(false)
    },
    onError: (err) => setError(apiError(err)),
  })

  if (isLoading || !dispute) return <PageSpinner />

  const isResolved = dispute.status === 'RESOLVED' || dispute.status === 'CLOSED'

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/disputes')} className="btn-ghost btn-sm">
          <ArrowLeft size={16} /> Zurück
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">
            Streitfall – {dispute.order.request?.title ?? `#${dispute.orderId.slice(-6)}`}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatDateTime(dispute.createdAt)}</p>
        </div>
        <Badge
          label={dispute.status === 'OPEN' ? 'Offen' : dispute.status === 'UNDER_REVIEW' ? 'In Prüfung' : 'Gelöst'}
          variant={dispute.status === 'OPEN' ? 'danger' : dispute.status === 'UNDER_REVIEW' ? 'warning' : 'success'}
        />
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Dispute info */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Streitfall-Details</h2>
          <div className="space-y-2 text-sm">
            <Row label="Begründung" value={dispute.reason} wrap />
            {dispute.resolution && <Row label="Lösung" value={dispute.resolution} wrap />}
            {dispute.outcome && <Row label="Ergebnis" value={dispute.outcome} />}
          </div>
        </div>

        {/* Order info */}
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Bestellungsdetails</h2>
          <div className="space-y-2 text-sm">
            <Row label="Leistung" value={dispute.order.request?.title ?? '—'} />
            <Row label="Gesamtbetrag" value={formatEur(dispute.order.totalAmount)} />
            <Row label="Plattformgebühr" value={formatEur(dispute.order.platformFee)} />
            <Row label="Netto (Dienstleister)" value={formatEur(dispute.order.providerAmount)} />
          </div>
          <div className="pt-2 border-t border-gray-100">
            <OrderStatusBadge status={dispute.order.status} />
          </div>
        </div>

        {/* Parties */}
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Auftraggeber</h2>
          <div className="text-sm space-y-1">
            <p className="font-medium text-gray-900">{dispute.order.customer.displayName}</p>
            <p className="text-gray-500">{dispute.order.customer.email}</p>
          </div>
        </div>

        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Dienstleister</h2>
          <div className="text-sm space-y-1">
            <p className="font-medium text-gray-900">{dispute.order.provider.displayName}</p>
            <p className="text-gray-500">{dispute.order.provider.email}</p>
          </div>
        </div>
      </div>

      {/* Evidence */}
      {dispute.evidence && dispute.evidence.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Beweise ({dispute.evidence.length})</h2>
          <div className="grid grid-cols-2 gap-3">
            {dispute.evidence.map((ev) => (
              <div key={ev.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <Badge label={ev.side === 'customer' ? 'Auftraggeber' : 'Dienstleister'} variant={ev.side === 'customer' ? 'info' : 'default'} />
                  <span className="text-xs text-gray-400">{formatDateTime(ev.createdAt)}</span>
                </div>
                {ev.description && <p className="text-gray-600 mb-2">{ev.description}</p>}
                <a href={ev.fileUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline text-xs">
                  Datei öffnen →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resolve action */}
      {!isResolved && (
        <button className="btn-primary" onClick={() => setShowResolve(true)}>
          Streitfall lösen
        </button>
      )}

      {/* Resolve Modal */}
      <Modal open={showResolve} onClose={() => { setShowResolve(false); setError('') }} title="Streitfall lösen" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Wähle das Ergebnis. Diese Aktion kann nicht rückgängig gemacht werden.
          </p>

          <div className="grid grid-cols-1 gap-2">
            {OUTCOMES.map((o) => (
              <label
                key={o.value}
                className={`flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-colors ${outcome === o.value ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <input type="radio" className="mt-1" value={o.value} checked={outcome === o.value} onChange={() => setOutcome(o.value)} />
                <div>
                  <p className="font-medium text-gray-900 text-sm">{o.label}</p>
                  <p className="text-xs text-gray-500">{o.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {outcome === 'PARTIAL_RELEASE' && (
            <div>
              <label className="label">Betrag für Dienstleister (€)</label>
              <input
                type="number"
                className="input"
                min={0}
                max={dispute.order.totalAmount}
                step={0.01}
                placeholder={`Max. ${dispute.order.providerAmount.toFixed(2)}`}
                value={providerAmount}
                onChange={(e) => setProviderAmount(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="label">Begründung / Notizen *</label>
            <textarea className="input h-24 resize-none" placeholder="Beschreibe die Entscheidungsgrundlage…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowResolve(false)}>Abbrechen</button>
            <button
              className="btn-primary"
              disabled={resolveMutation.isPending || !notes.trim()}
              onClick={() => resolveMutation.mutate()}
            >
              {resolveMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Entscheidung speichern'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Row({ label, value, wrap }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className={wrap ? 'space-y-0.5' : 'flex justify-between gap-4'}>
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className={`font-medium text-gray-900 ${wrap ? '' : 'text-right'}`}>{value}</span>
    </div>
  )
}
