import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { adminApi } from '@/api/admin.api'
import { DisputeStatusBadge, OrderStatusBadge, DISPUTE_REASON_CATEGORY_LABEL } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { formatDateTime, formatEur } from '@/lib/utils'
import { apiError } from '@/api/client'
import { useAuthStore } from '@/store/auth.store'
import type { DisputeOutcome } from '@/api/types'

const OUTCOMES: { value: DisputeOutcome; label: string; desc: string }[] = [
  { value: 'FULL_RELEASE',     label: 'Volle Auszahlung',      desc: 'Gesamtbetrag an Dienstleister' },
  { value: 'FULL_REFUND',      label: 'Volle Erstattung',      desc: 'Gesamtbetrag zurück an Auftraggeber' },
  { value: 'PARTIAL_RELEASE',  label: 'Teillösung',            desc: 'Aufteilung des Betrags' },
  { value: 'REWORK_AGREEMENT', label: 'Nacharbeit vereinbart', desc: 'Betrag bleibt eingefroren, neue Frist' },
  { value: 'ESCALATED',        label: 'Eskaliert',             desc: 'An externe Schlichtungsstelle verwiesen' },
]

export default function DisputeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const adminId = useAuthStore((s) => s.user?.id)

  const [showResolve, setShowResolve] = useState(false)
  const [outcome, setOutcome] = useState<DisputeOutcome>('FULL_RELEASE')
  const [resolutionNote, setResolutionNote] = useState('')
  const [releasedAmount, setReleasedAmount] = useState('')
  const [error, setError] = useState('')

  const [showRecommend, setShowRecommend] = useState(false)
  const [recommendation, setRecommendation] = useState<DisputeOutcome>('FULL_RELEASE')
  const [internalNote, setInternalNote] = useState('')

  const { data: dispute, isLoading } = useQuery({
    queryKey: ['admin-dispute', id],
    queryFn: () => adminApi.getDispute(id!).then((r) => r.data.dispute),
    enabled: !!id,
  })

  const assignMutation = useMutation({
    mutationFn: () => adminApi.assignDispute(id!, adminId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-dispute', id] }),
  })

  const recommendMutation = useMutation({
    mutationFn: () => adminApi.recommendDispute(id!, recommendation, internalNote),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-dispute', id] })
      setShowRecommend(false)
      setInternalNote('')
    },
    onError: (err) => setError(apiError(err)),
  })

  const resolveMutation = useMutation({
    mutationFn: () =>
      adminApi.resolveDispute(
        id!,
        outcome,
        resolutionNote,
        outcome === 'PARTIAL_RELEASE' ? parseFloat(releasedAmount) : undefined,
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

  const isResolved = dispute.status === 'RESOLVED'

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
        <DisputeStatusBadge status={dispute.status} />
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Dispute info */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Streitfall-Details</h2>
          <div className="space-y-2 text-sm">
            <Row label="Grund" value={DISPUTE_REASON_CATEGORY_LABEL[dispute.reasonCategory] ?? dispute.reasonCategory} />
            <Row label="Beschreibung" value={dispute.description} wrap />
            {dispute.recommendation && (
              <Row label="Empfehlung (Support)" value={OUTCOMES.find((o) => o.value === dispute.recommendation)?.label ?? dispute.recommendation} />
            )}
            {dispute.internalNote && <Row label="Interne Notiz" value={dispute.internalNote} wrap />}
            {dispute.resolutionNote && <Row label="Entscheidungsbegründung" value={dispute.resolutionNote} wrap />}
            {dispute.outcome && <Row label="Ergebnis" value={OUTCOMES.find((o) => o.value === dispute.outcome)?.label ?? dispute.outcome} />}
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

      {/* Intake questionnaire */}
      {dispute.intakeAnswers && dispute.intakeAnswers.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Angaben beim Eröffnen (strukturiert)</h2>
          <div className="space-y-2">
            {dispute.intakeAnswers.map((qa) => (
              <div key={qa.key} className="flex justify-between gap-4 text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                <span className="text-gray-500">{qa.question}</span>
                <span className="font-medium text-gray-900 text-right">{qa.answer}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Response from the other party */}
      {dispute.respondedById && (
        <div className="card p-5 space-y-2">
          <h2 className="font-semibold text-gray-900">Antwort der Gegenseite</h2>
          <p className="text-sm font-medium">
            {dispute.responseAgreesWithClaim ? '✅ Stimmt der Darstellung zu' : '❌ Sieht es anders'}
          </p>
          {dispute.responseDescription && <p className="text-sm text-gray-600">{dispute.responseDescription}</p>}
          {dispute.respondedAt && <p className="text-xs text-gray-400">{formatDateTime(dispute.respondedAt)}</p>}
        </div>
      )}
      {!dispute.respondedById && !isResolved && (
        <div className="card p-5 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800">⏳ Die Gegenseite hat noch nicht geantwortet.</p>
        </div>
      )}

      {/* Evidence */}
      {dispute.evidence && dispute.evidence.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Beweise ({dispute.evidence.length})</h2>
          <div className="grid grid-cols-2 gap-3">
            {dispute.evidence.map((ev) => (
              <div key={ev.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ev.side === 'customer' ? 'bg-sky-100 text-sky-700' : 'bg-brand-100 text-brand-700'}`}>
                    {ev.side === 'customer' ? 'Auftraggeber' : 'Dienstleister'}
                  </span>
                  <span className="text-xs text-gray-400">{formatDateTime(ev.createdAt)}</span>
                </div>
                <p className="text-gray-600 mb-2 truncate">{ev.fileName}</p>
                <a href={ev.fileUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline text-xs">
                  Datei öffnen →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workflow actions */}
      {!isResolved && (
        <div className="flex flex-wrap gap-3">
          {!dispute.assignedToId && (
            <button className="btn-secondary" disabled={assignMutation.isPending} onClick={() => assignMutation.mutate()}>
              {assignMutation.isPending ? <Spinner className="h-4 w-4" /> : 'Mir zuweisen'}
            </button>
          )}
          <button className="btn-secondary" onClick={() => setShowRecommend(true)}>
            Empfehlung abgeben
          </button>
          <button className="btn-primary" onClick={() => setShowResolve(true)}>
            Streitfall lösen (Admin)
          </button>
        </div>
      )}

      {/* Recommend Modal (Help Desk) */}
      <Modal open={showRecommend} onClose={() => { setShowRecommend(false); setError('') }} title="Empfehlung abgeben" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Deine Empfehlung wird dem entscheidenden Admin angezeigt, bewegt aber selbst kein Geld.
          </p>
          <div className="grid grid-cols-1 gap-2">
            {OUTCOMES.map((o) => (
              <label
                key={o.value}
                className={`flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-colors ${recommendation === o.value ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <input type="radio" className="mt-1" value={o.value} checked={recommendation === o.value} onChange={() => setRecommendation(o.value)} />
                <div>
                  <p className="font-medium text-gray-900 text-sm">{o.label}</p>
                  <p className="text-xs text-gray-500">{o.desc}</p>
                </div>
              </label>
            ))}
          </div>
          <div>
            <label className="label">Notiz *</label>
            <textarea className="input h-24 resize-none" placeholder="Warum diese Empfehlung?" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowRecommend(false)}>Abbrechen</button>
            <button
              className="btn-primary"
              disabled={recommendMutation.isPending || internalNote.trim().length < 10}
              onClick={() => recommendMutation.mutate()}
            >
              {recommendMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Empfehlung speichern'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Resolve Modal (Admin, financial) */}
      <Modal open={showResolve} onClose={() => { setShowResolve(false); setError('') }} title="Streitfall lösen" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Wähle das Ergebnis. Diese Aktion bewegt Geld und kann nicht rückgängig gemacht werden.
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
                value={releasedAmount}
                onChange={(e) => setReleasedAmount(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="label">Begründung / Notizen *</label>
            <textarea className="input h-24 resize-none" placeholder="Beschreibe die Entscheidungsgrundlage…" value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowResolve(false)}>Abbrechen</button>
            <button
              className="btn-primary"
              disabled={resolveMutation.isPending || resolutionNote.trim().length < 10}
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
