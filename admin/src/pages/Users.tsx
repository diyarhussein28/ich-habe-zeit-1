import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { adminApi } from '@/api/admin.api'
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from '@/components/ui/Table'
import { KycBadge, RoleBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { formatDate, initials } from '@/lib/utils'
import { apiError } from '@/api/client'
import type { AdminUser, VerificationStatus } from '@/api/types'

const KYC_TRANSITIONS: Record<string, { label: string; value: VerificationStatus }[]> = {
  KYC_PENDING:      [{ label: '✓ Verifizieren', value: 'KYC_VERIFIED' }, { label: '✗ Ablehnen', value: 'KYC_REJECTED' }, { label: 'Erneute Einreichung', value: 'KYC_RESUBMISSION' }],
  KYC_RESUBMISSION: [{ label: '✓ Verifizieren', value: 'KYC_VERIFIED' }, { label: '✗ Ablehnen', value: 'KYC_REJECTED' }],
  KYC_VERIFIED:     [{ label: 'Auszahlung sperren', value: 'PAYOUT_RESTRICTED' }],
  KYC_REJECTED:     [{ label: 'Erneute Einreichung erlauben', value: 'KYC_RESUBMISSION' }],
  PAYOUT_RESTRICTED:[{ label: '✓ Freigeben', value: 'KYC_VERIFIED' }],
}

export default function Users() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [kycFilter, setKycFilter] = useState('')
  const [page, setPage] = useState(1)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [kycNotes, setKycNotes] = useState('')
  const [error, setError] = useState('')
  const [roleMsg, setRoleMsg] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search, roleFilter, kycFilter, page],
    queryFn: () =>
      adminApi.getUsers({
        search: search || undefined,
        role: roleFilter || undefined,
        verificationStatus: kycFilter || undefined,
        page,
        limit: 20,
      }).then((r) => r.data),
    placeholderData: (prev) => prev,
  })

  const kycMutation = useMutation({
    mutationFn: ({ status }: { status: VerificationStatus }) =>
      adminApi.updateKyc(selectedUser!.id, status, kycNotes || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      setSelectedUser(null)
      setKycNotes('')
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  const suspendMutation = useMutation({
    mutationFn: ({ id, suspended }: { id: string; suspended: boolean }) =>
      adminApi.suspendUser(id, suspended),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'CUSTOMER' | 'PROVIDER' }) =>
      adminApi.changeRole(id, role),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setRoleMsg(`Rolle erfolgreich geändert zu ${vars.role === 'PROVIDER' ? 'Dienstleister' : 'Auftraggeber'}`)
      setTimeout(() => setRoleMsg(''), 4000)
    },
    onError: (err) => setRoleMsg(`Fehler: ${apiError(err)}`),
  })

  const transitions = selectedUser ? (KYC_TRANSITIONS[selectedUser.verificationStatus] ?? []) : []

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Benutzer</h1>

      {roleMsg && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${roleMsg.startsWith('Fehler') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {roleMsg}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 w-64"
            placeholder="Name oder E-Mail suchen…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select className="input w-44" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}>
          <option value="">Alle Rollen</option>
          <option value="CUSTOMER">Auftraggeber</option>
          <option value="PROVIDER">Dienstleister</option>
          <option value="ADMIN">Admin</option>
          <option value="HELP_DESK">Support</option>
        </select>
        <select className="input w-52" value={kycFilter} onChange={(e) => { setKycFilter(e.target.value); setPage(1) }}>
          <option value="">Alle KYC-Status</option>
          <option value="KYC_PENDING">KYC ausstehend</option>
          <option value="KYC_VERIFIED">Verifiziert</option>
          <option value="KYC_REJECTED">Abgelehnt</option>
          <option value="SUSPENDED">Gesperrt</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? <PageSpinner /> : (
        <div className="card overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th>Benutzer</Th>
                <Th>Rolle</Th>
                <Th>KYC-Status</Th>
                <Th>Registriert</Th>
                <Th>Aktionen</Th>
              </tr>
            </Thead>
            <Tbody>
              {data?.data.length === 0 ? (
                <EmptyRow cols={5} message="Keine Benutzer gefunden" />
              ) : (
                data?.data.map((user) => (
                  <Tr key={user.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold">
                          {initials(user.displayName)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{user.displayName}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td><RoleBadge role={user.role} /></Td>
                    <Td><KycBadge status={user.verificationStatus} /></Td>
                    <Td className="text-gray-500 text-xs">{formatDate(user.createdAt)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        {user.role === 'PROVIDER' && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setSelectedUser(user)}>
                            KYC
                          </button>
                        )}
                        {(user.role === 'CUSTOMER' || user.role === 'PROVIDER') && (
                          <button
                            className="btn btn-secondary btn-sm"
                            disabled={roleMutation.isPending}
                            onClick={() => roleMutation.mutate({ id: user.id, role: user.role === 'CUSTOMER' ? 'PROVIDER' : 'CUSTOMER' })}
                          >
                            → {user.role === 'CUSTOMER' ? 'Dienstleister' : 'Auftraggeber'}
                          </button>
                        )}
                        {user.verificationStatus !== 'SUSPENDED' ? (
                          <button
                            className="btn btn-sm text-red-600 hover:bg-red-50"
                            onClick={() => suspendMutation.mutate({ id: user.id, suspended: true })}
                          >
                            Sperren
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm text-green-600 hover:bg-green-50"
                            onClick={() => suspendMutation.mutate({ id: user.id, suspended: false })}
                          >
                            Freigeben
                          </button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>

          {/* Pagination */}
          {data && data.total > 20 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} von {data.total}
              </p>
              <div className="flex gap-2">
                <button className="btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹ Zurück</button>
                <button className="btn-secondary btn-sm" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>Weiter ›</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* KYC Modal */}
      <Modal open={!!selectedUser} onClose={() => { setSelectedUser(null); setKycNotes(''); setError('') }} title={`KYC – ${selectedUser?.displayName}`}>
        {selectedUser && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-4 text-sm space-y-1">
              <p><span className="text-gray-500">E-Mail:</span> {selectedUser.email}</p>
              <p><span className="text-gray-500">Telefon:</span> {selectedUser.phone}</p>
              <p className="flex items-center gap-2"><span className="text-gray-500">Status:</span> <KycBadge status={selectedUser.verificationStatus} /></p>
              {selectedUser.providerProfile && (
                <p><span className="text-gray-500">Kleinunternehmer:</span> {selectedUser.providerProfile.isKleinunternehmer ? 'Ja' : 'Nein'}</p>
              )}
            </div>

            <div>
              <label className="label">Notizen (optional)</label>
              <textarea
                className="input h-20 resize-none"
                placeholder="Notizen zur KYC-Entscheidung…"
                value={kycNotes}
                onChange={(e) => setKycNotes(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {transitions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {transitions.map((t) => (
                  <button
                    key={t.value}
                    className={t.value === 'KYC_VERIFIED' ? 'btn-primary' : t.value === 'KYC_REJECTED' ? 'btn-danger' : 'btn-secondary'}
                    disabled={kycMutation.isPending}
                    onClick={() => kycMutation.mutate({ status: t.value })}
                  >
                    {kycMutation.isPending ? <Spinner className="h-4 w-4" /> : t.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Keine KYC-Aktionen verfügbar für diesen Status.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
