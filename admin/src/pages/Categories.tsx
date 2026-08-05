import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, RotateCcw, ChevronDown, ChevronRight, X } from 'lucide-react'
import { adminApi } from '@/api/admin.api'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { apiError } from '@/api/client'
import type { Category, CategoryCustomField } from '@/api/types'

interface CategoryForm {
  name: string
  description: string
  icon: string
  parentId: string
  commissionRate: string
  geoRestrictions: string // comma-separated
  requiredVerificationDocTypes: string // comma-separated
  reducedVatEligible: boolean
  customFields: CategoryCustomField[]
}

const EMPTY_FORM: CategoryForm = {
  name: '', description: '', icon: '🔧', parentId: '',
  commissionRate: '', geoRestrictions: '', requiredVerificationDocTypes: '',
  reducedVatEligible: false, customFields: [],
}

function splitCsv(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

export default function Categories() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { data: categories, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => adminApi.getCategories().then((r) => r.data),
  })

  const topLevel = (categories ?? []).filter((c) => !c.parentId)
  const childrenOf = (id: string) => (categories ?? []).filter((c) => c.parentId === id)

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        icon: form.icon || undefined,
        description: form.description || undefined,
        parentId: form.parentId || undefined,
        commissionRate: form.commissionRate ? Number(form.commissionRate) / 100 : undefined,
        geoRestrictions: splitCsv(form.geoRestrictions),
        requiredVerificationDocTypes: splitCsv(form.requiredVerificationDocTypes),
        reducedVatEligible: form.reducedVatEligible,
        customFields: form.customFields,
      }
      return editId ? adminApi.updateCategory(editId, payload) : adminApi.createCategory(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] })
      closeModal()
    },
    onError: (err) => setError(apiError(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] })
      setDeleteConfirm(null)
    },
    onError: (err) => setError(apiError(err)),
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => adminApi.updateCategory(id, { isActive: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-categories'] }),
  })

  function openCreate(parentId?: string) {
    setEditId(null)
    setForm({ ...EMPTY_FORM, parentId: parentId ?? '' })
    setError('')
    setShowModal(true)
  }

  function openEdit(cat: Category) {
    setEditId(cat.id)
    setForm({
      name: cat.name,
      description: cat.description ?? '',
      icon: cat.icon ?? '🔧',
      parentId: cat.parentId ?? '',
      commissionRate: cat.commissionRate != null ? String(Math.round(cat.commissionRate * 100)) : '',
      geoRestrictions: (cat.geoRestrictions ?? []).join(', '),
      requiredVerificationDocTypes: (cat.requiredVerificationDocTypes ?? []).join(', '),
      reducedVatEligible: cat.reducedVatEligible ?? false,
      customFields: cat.customFields ?? [],
    })
    setError('')
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditId(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  function addCustomField() {
    setForm((f) => ({ ...f, customFields: [...f.customFields, { key: '', label: '', type: 'text', required: false }] }))
  }

  function updateCustomField(i: number, patch: Partial<CategoryCustomField>) {
    setForm((f) => ({ ...f, customFields: f.customFields.map((cf, idx) => (idx === i ? { ...cf, ...patch } : cf)) }))
  }

  function removeCustomField(i: number) {
    setForm((f) => ({ ...f, customFields: f.customFields.filter((_, idx) => idx !== i) }))
  }

  function renderCard(cat: Category, isChild = false) {
    const kids = childrenOf(cat.id)
    const isExpanded = expanded.has(cat.id)
    return (
      <div key={cat.id} className={isChild ? 'ml-8' : ''}>
        <div className="card p-5 flex items-start gap-4">
          {!isChild && kids.length > 0 && (
            <button
              className="mt-1 text-gray-400 hover:text-gray-600"
              onClick={() => setExpanded((s) => { const next = new Set(s); next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id); return next })}
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
          <span className="text-3xl leading-none mt-0.5">{cat.icon ?? '📦'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-900">{cat.name}</p>
              {!cat.isActive && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inaktiv</span>}
              {cat.reducedVatEligible && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">7% MwSt.</span>}
              {cat.requiredVerificationDocTypes?.length > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Nachweis erforderlich</span>
              )}
            </div>
            {cat.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{cat.description}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
              {cat.commissionRate != null && <span className="text-brand-600 font-medium">{Math.round(cat.commissionRate * 100)}% Provision</span>}
              {cat.geoRestrictions?.length > 0 && <span>Nur in: {cat.geoRestrictions.join(', ')}</span>}
              {cat.customFields && cat.customFields.length > 0 && <span>{cat.customFields.length} individuelle(s) Feld(er)</span>}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            {!isChild && (
              <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors" title="Unterkategorie hinzufügen" onClick={() => openCreate(cat.id)}>
                <Plus size={14} />
              </button>
            )}
            <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors" onClick={() => openEdit(cat)}>
              <Pencil size={14} />
            </button>
            {cat.isActive ? (
              <button className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors" onClick={() => setDeleteConfirm(cat.id)}>
                <Trash2 size={14} />
              </button>
            ) : (
              <button className="p-1.5 rounded hover:bg-green-50 text-gray-500 hover:text-green-600 transition-colors" title="Reaktivieren" onClick={() => reactivateMutation.mutate(cat.id)}>
                <RotateCcw size={14} />
              </button>
            )}
          </div>
        </div>
        {!isChild && isExpanded && kids.length > 0 && (
          <div className="mt-3 space-y-3">{kids.map((k) => renderCard(k, true))}</div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Kategorien</h1>
        <button className="btn-primary gap-2" onClick={() => openCreate()}>
          <Plus size={15} /> Neue Kategorie
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8 text-brand-600" /></div>
      ) : (
        <div className="space-y-3">{topLevel.map((cat) => renderCard(cat))}</div>
      )}

      {/* Create / Edit Modal */}
      <Modal open={showModal} onClose={closeModal} title={editId ? 'Kategorie bearbeiten' : form.parentId ? 'Neue Unterkategorie' : 'Neue Kategorie'} size="lg">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Name *</label>
              <input className="input" placeholder="z.B. Sanitär" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Icon (Emoji)</label>
              <input className="input text-2xl" maxLength={4} value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Beschreibung</label>
            <textarea className="input h-16 resize-none" placeholder="Kurzbeschreibung…" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Provision (%, optional — überschreibt global)</label>
              <input className="input" type="number" min={0} max={100} placeholder="z.B. 15" value={form.commissionRate} onChange={(e) => setForm((f) => ({ ...f, commissionRate: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input id="reducedVat" type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={form.reducedVatEligible} onChange={(e) => setForm((f) => ({ ...f, reducedVatEligible: e.target.checked }))} />
              <label htmlFor="reducedVat" className="text-sm text-gray-700">Ermäßigter MwSt.-Satz (7%, § 12 UStG)</label>
            </div>
          </div>

          <div>
            <label className="label">Geo-Einschränkung (PLZ-Präfixe oder Städte, kommagetrennt — leer = überall verfügbar)</label>
            <input className="input" placeholder="z.B. 10, 12, Berlin" value={form.geoRestrictions} onChange={(e) => setForm((f) => ({ ...f, geoRestrictions: e.target.value }))} />
          </div>

          <div>
            <label className="label">Erforderliche Nachweise (kommagetrennt, z.B. Elektro-Lizenz)</label>
            <input className="input" placeholder="z.B. elektro_lizenz" value={form.requiredVerificationDocTypes} onChange={(e) => setForm((f) => ({ ...f, requiredVerificationDocTypes: e.target.value }))} />
            <p className="text-xs text-gray-400 mt-1">Anbieter müssen für diese Kategorie einen von Admin geprüften Nachweis hochladen, bevor sie Angebote abgeben können.</p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="label mb-0">Individuelle Felder</label>
              <button className="btn-secondary btn-sm gap-1" onClick={addCustomField}><Plus size={12} /> Feld hinzufügen</button>
            </div>
            {form.customFields.length > 0 && (
              <div className="space-y-2 mt-2">
                {form.customFields.map((cf, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2">
                    <input className="input flex-1" placeholder="Schlüssel (z.B. rooms)" value={cf.key} onChange={(e) => updateCustomField(i, { key: e.target.value })} />
                    <input className="input flex-1" placeholder="Label (z.B. Anzahl Zimmer)" value={cf.label} onChange={(e) => updateCustomField(i, { label: e.target.value })} />
                    <select className="input w-32" value={cf.type} onChange={(e) => updateCustomField(i, { type: e.target.value as CategoryCustomField['type'] })}>
                      <option value="text">Text</option>
                      <option value="number">Zahl</option>
                      <option value="select">Auswahl</option>
                      <option value="boolean">Ja/Nein</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                      <input type="checkbox" checked={!!cf.required} onChange={(e) => updateCustomField(i, { required: e.target.checked })} />
                      Pflicht
                    </label>
                    <button className="p-1 text-gray-400 hover:text-red-600" onClick={() => removeCustomField(i)}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={closeModal}>Abbrechen</button>
            <button className="btn-primary" disabled={saveMutation.isPending || !form.name.trim()} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : (editId ? 'Speichern' : 'Erstellen')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Kategorie deaktivieren">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Diese Kategorie wird deaktiviert und verschwindet aus der App — bestehende Aufträge und Daten bleiben vollständig erhalten. Sie kann jederzeit reaktiviert werden.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
            <button className="btn-danger" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteConfirm!)}>
              {deleteMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Deaktivieren'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
