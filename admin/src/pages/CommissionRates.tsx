import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { adminApi } from '@/api/admin.api'
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'
import { apiError } from '@/api/client'
import type { CommissionRate } from '@/api/types'

type Scope = CommissionRate['scope']

interface RateForm {
  scope: Scope
  rate: number | ''
  categoryId: string
  city: string
}

const EMPTY_FORM: RateForm = { scope: 'GLOBAL', rate: '', categoryId: '', city: '' }

const SCOPE_LABELS: Record<Scope, string> = {
  GLOBAL:   'Global',
  CATEGORY: 'Kategorie',
  CITY:     'Stadt',
}

const scopeVariant = (s: Scope) => s === 'GLOBAL' ? 'danger' as const : s === 'CATEGORY' ? 'default' as const : 'info' as const

export default function CommissionRates() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<RateForm>(EMPTY_FORM)
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: rates, isLoading } = useQuery({
    queryKey: ['admin-commission-rates'],
    queryFn: () => adminApi.getCommissionRates().then((r) => r.data),
  })

  const { data: categories } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => adminApi.getCategories().then((r) => r.data),
    enabled: form.scope === 'CATEGORY',
  })

  const createMutation = useMutation({
    mutationFn: () =>
      adminApi.createCommissionRate({
        scope: form.scope,
        rate: Number(form.rate),
        categoryId: form.scope === 'CATEGORY' ? form.categoryId || undefined : undefined,
        city: form.scope === 'CITY' ? form.city || undefined : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-commission-rates'] })
      setShowCreate(false)
      setForm(EMPTY_FORM)
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCommissionRate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-commission-rates'] })
      setDeleteId(null)
    },
  })

  const isFormValid =
    form.rate !== '' &&
    Number(form.rate) >= 0 &&
    Number(form.rate) <= 100 &&
    (form.scope !== 'CATEGORY' || !!form.categoryId) &&
    (form.scope !== 'CITY' || !!form.city.trim())

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Provisionsätze</h1>
          <p className="text-sm text-gray-500 mt-1">Plattformgebühren nach Geltungsbereich (%)</p>
        </div>
        <button className="btn-primary gap-2" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> Neuer Satz
        </button>
      </div>

      {isLoading ? <PageSpinner /> : (
        <div className="card overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th>Geltungsbereich</Th>
                <Th>Kategorie / Stadt</Th>
                <Th>Satz (%)</Th>
                <Th>Erstellt</Th>
                <Th></Th>
              </tr>
            </Thead>
            <Tbody>
              {rates?.length === 0 ? (
                <EmptyRow cols={5} message="Keine Provisionsätze definiert" />
              ) : (
                rates?.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <Badge label={SCOPE_LABELS[r.scope]} variant={scopeVariant(r.scope)} />
                    </Td>
                    <Td className="text-gray-600">
                      {r.scope === 'CATEGORY' && (r.category?.name ?? r.categoryId ?? '—')}
                      {r.scope === 'CITY' && (r.city ?? '—')}
                      {r.scope === 'GLOBAL' && <span className="text-gray-400 italic">Alle</span>}
                    </Td>
                    <Td>
                      <span className="font-semibold text-gray-900">{r.rate.toFixed(2)} %</span>
                    </Td>
                    <Td className="text-xs text-gray-500">{formatDate(r.createdAt)}</Td>
                    <Td>
                      <button
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                        onClick={() => setDeleteId(r.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        </div>
      )}

      {/* Info box */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">Priorität der Provisionsätze</p>
        <p>Kategorie-spezifische Sätze überschreiben globale Sätze. Stadt-spezifische Sätze haben höchste Priorität.</p>
      </div>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setForm(EMPTY_FORM); setError('') }} title="Neuer Provisionsatz">
        <div className="space-y-4">
          <div>
            <label className="label">Geltungsbereich *</label>
            <select
              className="input"
              value={form.scope}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as Scope, categoryId: '', city: '' }))}
            >
              <option value="GLOBAL">Global (alle Aufträge)</option>
              <option value="CATEGORY">Kategorie-spezifisch</option>
              <option value="CITY">Stadt-spezifisch</option>
            </select>
          </div>

          {form.scope === 'CATEGORY' && (
            <div>
              <label className="label">Kategorie *</label>
              <select className="input" value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
                <option value="">-- Kategorie wählen --</option>
                {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {form.scope === 'CITY' && (
            <div>
              <label className="label">Stadt *</label>
              <input className="input" placeholder="z.B. München" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
          )}

          <div>
            <label className="label">Provisionsatz (%) *</label>
            <input
              type="number"
              className="input"
              min={0}
              max={100}
              step={0.01}
              placeholder="z.B. 12.50"
              value={form.rate}
              onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value === '' ? '' : parseFloat(e.target.value) }))}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); setError('') }}>
              Abbrechen
            </button>
            <button className="btn-primary" disabled={createMutation.isPending || !isFormValid} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Erstellen'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Provisionsatz löschen">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Diesen Provisionsatz wirklich löschen? Laufende Bestellungen sind nicht betroffen.</p>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setDeleteId(null)}>Abbrechen</button>
            <button className="btn-danger" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteId!)}>
              {deleteMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Löschen'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
