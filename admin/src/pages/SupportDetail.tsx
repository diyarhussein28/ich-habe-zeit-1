import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { adminApi } from '@/api/admin.api'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { formatDateTime } from '@/lib/utils'
import { apiError } from '@/api/client'
import type { TicketStatus } from '@/api/types'

const statusLabel: Record<string, string> = {
  OPEN: 'Offen',
  IN_PROGRESS: 'In Bearbeitung',
  RESOLVED: 'Gelöst',
  CLOSED: 'Geschlossen',
}

const statusVariant = (s: string) => {
  if (s === 'OPEN') return 'danger' as const
  if (s === 'IN_PROGRESS') return 'warning' as const
  if (s === 'RESOLVED') return 'success' as const
  return 'neutral' as const
}

export default function SupportDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [content, setContent] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [error, setError] = useState('')

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['admin-support-ticket', id],
    queryFn: () => adminApi.getSupportTicket(id!).then((r) => r.data.ticket),
    enabled: !!id,
  })

  const sendMutation = useMutation({
    mutationFn: () => adminApi.sendSupportTicketMessage(id!, content.trim(), isInternal),
    onSuccess: () => {
      setContent('')
      setIsInternal(false)
      qc.invalidateQueries({ queryKey: ['admin-support-ticket', id] })
      qc.invalidateQueries({ queryKey: ['admin-support-tickets'] })
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  const statusMutation = useMutation({
    mutationFn: (status: TicketStatus) => adminApi.updateSupportTicketStatus(id!, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-support-ticket', id] })
      qc.invalidateQueries({ queryKey: ['admin-support-tickets'] })
    },
  })

  if (isLoading || !ticket) return <PageSpinner />

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/support')} className="btn-ghost btn-sm">
          <ArrowLeft size={16} /> Zurück
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{ticket.subject}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {ticket.user?.displayName} · {ticket.user?.email} · {formatDateTime(ticket.createdAt)}
          </p>
        </div>
        <Badge label={statusLabel[ticket.status] ?? ticket.status} variant={statusVariant(ticket.status)} />
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-2">Anfrage</h2>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
        {ticket.orderId && (
          <p className="text-xs text-gray-400 mt-2">Bezieht sich auf Auftrag #{ticket.orderId.slice(-6)}</p>
        )}
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Verlauf</h2>
        <div className="space-y-3">
          {(ticket.messages ?? []).length === 0 && (
            <p className="text-sm text-gray-400">Noch keine Nachrichten.</p>
          )}
          {(ticket.messages ?? []).map((m) => (
            <div
              key={m.id}
              className={`rounded-lg p-3 text-sm ${m.isInternal ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-gray-900">
                  {m.sender?.displayName ?? 'Unbekannt'}
                  {m.isInternal && <span className="ml-2 text-xs font-normal text-amber-700">(intern)</span>}
                </span>
                <span className="text-xs text-gray-400">{formatDateTime(m.createdAt)}</span>
              </div>
              <p className="text-gray-700 whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
        </div>

        {ticket.status !== 'CLOSED' && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <textarea
              className="input h-20 resize-none"
              placeholder="Antwort schreiben…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
                Interne Notiz (für Kunde nicht sichtbar)
              </label>
              <button
                className="btn-primary"
                disabled={!content.trim() || sendMutation.isPending}
                onClick={() => sendMutation.mutate()}
              >
                {sendMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Senden'}
              </button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && (
          <button className="btn-secondary" onClick={() => statusMutation.mutate('RESOLVED')} disabled={statusMutation.isPending}>
            Als gelöst markieren
          </button>
        )}
        {ticket.status !== 'CLOSED' && (
          <button className="btn-secondary" onClick={() => statusMutation.mutate('CLOSED')} disabled={statusMutation.isPending}>
            Schließen
          </button>
        )}
        {ticket.status === 'CLOSED' && (
          <button className="btn-secondary" onClick={() => statusMutation.mutate('OPEN')} disabled={statusMutation.isPending}>
            Wieder öffnen
          </button>
        )}
      </div>
    </div>
  )
}
