import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { adminApi } from '@/api/admin.api'
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from '@/components/ui/Table'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { apiError } from '@/api/client'
import { formatDateTime } from '@/lib/utils'
import type { BlacklistIdentifierType, BanType } from '@/api/types'

type Tab = 'content' | 'blacklist' | 'bans'

export default function Moderation() {
  const [tab, setTab] = useState<Tab>('content')

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Moderation &amp; Missbrauchsschutz</h1>

      <div className="flex gap-1 border-b border-gray-200">
        {([
          ['content', 'Inhaltsprüfung'],
          ['blacklist', 'Anbieter-Sperrliste'],
          ['bans', 'IP-/Geräte-Sperren'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'content' && <ContentModerationTab />}
      {tab === 'blacklist' && <BlacklistTab />}
      {tab === 'bans' && <BansTab />}
    </div>
  )
}

// ── Content review queue ───────────────────────────────────────────────────

const CONTENT_TYPE_LABEL: Record<string, string> = {
  PROFILE_PHOTO: 'Profilbild',
  SERVICE_PHOTO: 'Service-Foto',
  REQUEST_PHOTO: 'Auftragsfoto',
  COMPLETION_PHOTO: 'Abschlussfoto',
}

function ContentModerationTab() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-moderation-queue', statusFilter],
    queryFn: () => adminApi.getModerationQueue(statusFilter).then((r) => r.data.items),
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) => adminApi.reviewContent(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-moderation-queue'] }),
  })

  return (
    <div className="space-y-4">
      <select className="input w-52" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
        <option value="PENDING">Ausstehend</option>
        <option value="APPROVED">Genehmigt</option>
        <option value="REJECTED">Abgelehnt</option>
      </select>

      {isLoading ? <PageSpinner /> : !data || data.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">Keine Inhalte in dieser Ansicht.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {data.map((item) => (
            <div key={item.id} className="card overflow-hidden">
              <a href={item.contentUrl} target="_blank" rel="noreferrer" className="block aspect-square bg-gray-100">
                <img src={item.contentUrl} alt={CONTENT_TYPE_LABEL[item.contentType]} className="h-full w-full object-cover" />
              </a>
              <div className="p-3 space-y-2">
                <p className="text-xs font-medium text-gray-700">{CONTENT_TYPE_LABEL[item.contentType] ?? item.contentType}</p>
                <p className="text-[11px] text-gray-400">{formatDateTime(item.createdAt)}</p>
                {statusFilter === 'PENDING' && (
                  <div className="flex gap-2">
                    <button
                      className="btn-secondary btn-sm flex-1"
                      disabled={reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate({ id: item.id, status: 'APPROVED' })}
                    >
                      Genehmigen
                    </button>
                    <button
                      className="btn-danger btn-sm flex-1"
                      disabled={reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate({ id: item.id, status: 'REJECTED' })}
                    >
                      Entfernen
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Provider blacklist ──────────────────────────────────────────────────────

function BlacklistTab() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<{ identifierType: BlacklistIdentifierType; identifierValue: string; reason: string }>({
    identifierType: 'EMAIL', identifierValue: '', reason: '',
  })
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-blacklist'],
    queryFn: () => adminApi.getBlacklist().then((r) => r.data.entries),
  })

  const addMutation = useMutation({
    mutationFn: () => adminApi.addToBlacklist(form.identifierType, form.identifierValue, form.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-blacklist'] })
      setShowModal(false)
      setForm({ identifierType: 'EMAIL', identifierValue: '', reason: '' })
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => adminApi.removeFromBlacklist(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-blacklist'] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary gap-2" onClick={() => setShowModal(true)}><Plus size={15} /> Eintrag hinzufügen</button>
      </div>

      {isLoading ? <PageSpinner /> : (
        <div className="card overflow-hidden">
          <Table>
            <Thead><tr><Th>Typ</Th><Th>Wert</Th><Th>Grund</Th><Th>Erstellt</Th><Th></Th></tr></Thead>
            <Tbody>
              {data?.length === 0 ? <EmptyRow cols={5} message="Keine gesperrten Identitäten" /> : data?.map((e) => (
                <Tr key={e.id}>
                  <Td>{e.identifierType}</Td>
                  <Td className="font-mono text-sm">{e.identifierValue}</Td>
                  <Td className="text-sm text-gray-600">{e.reason}</Td>
                  <Td className="text-xs text-gray-500">{formatDateTime(e.createdAt)}</Td>
                  <Td>
                    <button className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600" onClick={() => removeMutation.mutate(e.id)}>
                      <Trash2 size={14} />
                    </button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Identität sperren">
        <div className="space-y-4">
          <div>
            <label className="label">Typ</label>
            <select className="input" value={form.identifierType} onChange={(e) => setForm((f) => ({ ...f, identifierType: e.target.value as BlacklistIdentifierType }))}>
              <option value="EMAIL">E-Mail</option>
              <option value="PHONE">Telefon</option>
              <option value="DEVICE_ID">Geräte-ID</option>
              <option value="DOCUMENT_HASH">Dokumenten-Hash</option>
            </select>
          </div>
          <div>
            <label className="label">Wert</label>
            <input className="input" value={form.identifierValue} onChange={(e) => setForm((f) => ({ ...f, identifierValue: e.target.value }))} />
          </div>
          <div>
            <label className="label">Grund</label>
            <textarea className="input h-20 resize-none" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowModal(false)}>Abbrechen</button>
            <button className="btn-danger" disabled={addMutation.isPending || !form.identifierValue || !form.reason} onClick={() => addMutation.mutate()}>
              {addMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Sperren'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── IP / device bans ─────────────────────────────────────────────────────────

function BansTab() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<{ type: BanType; value: string; reason: string }>({ type: 'IP', value: '', reason: '' })
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-bans'],
    queryFn: () => adminApi.getBans().then((r) => r.data.bans),
  })

  const addMutation = useMutation({
    mutationFn: () => adminApi.addBan(form.type, form.value, form.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-bans'] })
      setShowModal(false)
      setForm({ type: 'IP', value: '', reason: '' })
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => adminApi.removeBan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-bans'] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary gap-2" onClick={() => setShowModal(true)}><Plus size={15} /> Sperre hinzufügen</button>
      </div>

      {isLoading ? <PageSpinner /> : (
        <div className="card overflow-hidden">
          <Table>
            <Thead><tr><Th>Typ</Th><Th>Wert</Th><Th>Grund</Th><Th>Erstellt</Th><Th></Th></tr></Thead>
            <Tbody>
              {data?.length === 0 ? <EmptyRow cols={5} message="Keine aktiven Sperren" /> : data?.map((b) => (
                <Tr key={b.id}>
                  <Td>{b.type === 'IP' ? 'IP-Adresse' : 'Gerät'}</Td>
                  <Td className="font-mono text-sm">{b.value}</Td>
                  <Td className="text-sm text-gray-600">{b.reason}</Td>
                  <Td className="text-xs text-gray-500">{formatDateTime(b.createdAt)}</Td>
                  <Td>
                    <button className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600" onClick={() => removeMutation.mutate(b.id)}>
                      <Trash2 size={14} />
                    </button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="IP/Gerät sperren">
        <div className="space-y-4">
          <div>
            <label className="label">Typ</label>
            <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as BanType }))}>
              <option value="IP">IP-Adresse</option>
              <option value="DEVICE">Geräte-ID</option>
            </select>
          </div>
          <div>
            <label className="label">Wert</label>
            <input className="input" placeholder={form.type === 'IP' ? 'z.B. 203.0.113.5' : 'Geräte-ID'} value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
          </div>
          <div>
            <label className="label">Grund</label>
            <textarea className="input h-20 resize-none" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowModal(false)}>Abbrechen</button>
            <button className="btn-danger" disabled={addMutation.isPending || !form.value || !form.reason} onClick={() => addMutation.mutate()}>
              {addMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Sperren'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
