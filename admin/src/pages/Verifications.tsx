import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/api/admin.api'
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from '@/components/ui/Table'
import { KycBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { KycDocumentGallery } from '@/components/KycDocumentGallery'
import { apiError } from '@/api/client'
import { formatDate, initials } from '@/lib/utils'
import type { AdminUser, VerificationStatus, PendingCategoryVerification } from '@/api/types'

const KYC_TRANSITIONS: Record<string, { label: string; value: VerificationStatus }[]> = {
  KYC_PENDING: [
    { label: '✓ Verifizieren', value: 'KYC_VERIFIED' },
    { label: '✗ Ablehnen', value: 'KYC_REJECTED' },
    { label: 'Erneute Einreichung', value: 'KYC_RESUBMISSION' },
  ],
  KYC_RESUBMISSION: [
    { label: '✓ Verifizieren', value: 'KYC_VERIFIED' },
    { label: '✗ Ablehnen', value: 'KYC_REJECTED' },
  ],
}

export default function Verifications() {
  const qc = useQueryClient()
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [kycNotes, setKycNotes] = useState('')
  const [error, setError] = useState('')
  const [reviewingDocs, setReviewingDocs] = useState<PendingCategoryVerification | null>(null)

  const { data: pendingKyc, isLoading: kycLoading } = useQuery({
    queryKey: ['admin-kyc-queue'],
    queryFn: async () => {
      const [pending, resubmission] = await Promise.all([
        adminApi.getUsers({ verificationStatus: 'KYC_PENDING', limit: 50 }).then((r) => r.data.data),
        adminApi.getUsers({ verificationStatus: 'KYC_RESUBMISSION', limit: 50 }).then((r) => r.data.data),
      ])
      return [...pending, ...resubmission]
    },
  })

  const { data: pendingCategoryVerifications, isLoading: catLoading } = useQuery({
    queryKey: ['admin-category-verification-queue'],
    queryFn: () => adminApi.getPendingCategoryVerifications().then((r) => r.data.items),
  })

  const kycMutation = useMutation({
    mutationFn: ({ status }: { status: VerificationStatus }) =>
      adminApi.updateKyc(selectedUser!.id, status, kycNotes || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-kyc-queue'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      setSelectedUser(null)
      setKycNotes('')
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  const categoryReviewMutation = useMutation({
    mutationFn: ({ isVerified }: { isVerified: boolean }) =>
      adminApi.reviewCategoryVerification(
        reviewingDocs!.providerProfile.user.id,
        reviewingDocs!.categoryId,
        isVerified
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-category-verification-queue'] })
      setReviewingDocs(null)
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  const transitions = selectedUser ? (KYC_TRANSITIONS[selectedUser.verificationStatus] ?? []) : []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Verifizierungen</h1>
        <p className="text-sm text-gray-500 mt-1">Identitätsprüfung und kategoriespezifische Nachweise für Dienstleister.</p>
      </div>

      {/* ── KYC queue ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">KYC-Warteschlange</h2>
        {kycLoading ? <PageSpinner /> : (
          <div className="card overflow-hidden">
            <Table>
              <Thead>
                <tr>
                  <Th>Anbieter</Th>
                  <Th>Status</Th>
                  <Th>Registriert</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <Tbody>
                {!pendingKyc || pendingKyc.length === 0 ? (
                  <EmptyRow cols={4} message="Keine offenen KYC-Prüfungen — alles erledigt ✓" />
                ) : (
                  pendingKyc.map((user) => (
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
                      <Td><KycBadge status={user.verificationStatus} /></Td>
                      <Td className="text-gray-500 text-xs">{formatDate(user.createdAt)}</Td>
                      <Td>
                        <button className="btn btn-primary btn-sm" onClick={() => setSelectedUser(user)}>
                          Prüfen
                        </button>
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          </div>
        )}
      </section>

      {/* ── Category-specific verification queue ─────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Kategorie-Nachweise (z. B. Elektro-Lizenz)
        </h2>
        {catLoading ? <PageSpinner /> : (
          <div className="card overflow-hidden">
            <Table>
              <Thead>
                <tr>
                  <Th>Anbieter</Th>
                  <Th>Kategorie</Th>
                  <Th>Nachweise</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <Tbody>
                {!pendingCategoryVerifications || pendingCategoryVerifications.length === 0 ? (
                  <EmptyRow cols={4} message="Keine offenen Kategorie-Nachweise" />
                ) : (
                  pendingCategoryVerifications.map((item) => (
                    <Tr key={item.id}>
                      <Td>
                        <p className="font-medium text-gray-900">{item.providerProfile.user.displayName}</p>
                        <p className="text-xs text-gray-500">{item.providerProfile.user.email}</p>
                      </Td>
                      <Td>{item.category.name}</Td>
                      <Td className="text-xs text-gray-500">{item.verificationDocUrls.length} Datei(en)</Td>
                      <Td>
                        <button className="btn btn-primary btn-sm" onClick={() => setReviewingDocs(item)}>
                          Prüfen
                        </button>
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          </div>
        )}
      </section>

      {/* KYC Modal */}
      <Modal open={!!selectedUser} onClose={() => { setSelectedUser(null); setKycNotes(''); setError('') }} title={`KYC – ${selectedUser?.displayName}`}>
        {selectedUser && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-4 text-sm space-y-1">
              <p><span className="text-gray-500">E-Mail:</span> {selectedUser.email}</p>
              <p><span className="text-gray-500">Telefon:</span> {selectedUser.phone}</p>
              <p className="flex items-center gap-2"><span className="text-gray-500">Status:</span> <KycBadge status={selectedUser.verificationStatus} /></p>
            </div>

            <div>
              <label className="label">Eingereichte Dokumente</label>
              <KycDocumentGallery userId={selectedUser.id} />
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

            {transitions.length > 0 && (
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
            )}
          </div>
        )}
      </Modal>

      {/* Category verification modal */}
      <Modal
        open={!!reviewingDocs}
        onClose={() => { setReviewingDocs(null); setError('') }}
        title={`${reviewingDocs?.category.name} – Nachweis prüfen`}
      >
        {reviewingDocs && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {reviewingDocs.providerProfile.user.displayName} möchte in der Kategorie{' '}
              <strong>{reviewingDocs.category.name}</strong> anbieten und hat folgende Nachweise eingereicht:
            </p>
            <div className="grid grid-cols-3 gap-3">
              {reviewingDocs.verificationDocUrls.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="block rounded-lg border border-gray-200 overflow-hidden hover:border-brand-400">
                  <div className="aspect-square bg-gray-100 flex items-center justify-center">
                    <img src={url} alt={`Nachweis ${i + 1}`} className="h-full w-full object-cover" />
                  </div>
                </a>
              ))}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-3">
              <button
                className="btn-danger"
                disabled={categoryReviewMutation.isPending}
                onClick={() => categoryReviewMutation.mutate({ isVerified: false })}
              >
                Ablehnen
              </button>
              <button
                className="btn-primary"
                disabled={categoryReviewMutation.isPending}
                onClick={() => categoryReviewMutation.mutate({ isVerified: true })}
              >
                {categoryReviewMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Genehmigen'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
