import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { adminApi } from '@/api/admin.api'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { apiError } from '@/api/client'
import type { Category } from '@/api/types'

interface CategoryForm {
  name: string
  description: string
  icon: string
}

const EMPTY_FORM: CategoryForm = { name: '', description: '', icon: '🔧' }

export default function Categories() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data: categories, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => adminApi.getCategories().then((r) => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      editId
        ? adminApi.updateCategory(editId, { name: form.name, icon: form.icon })
        : adminApi.createCategory({ name: form.name, icon: form.icon || undefined, description: form.description || undefined }),
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

  function openCreate() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowModal(true)
  }

  function openEdit(cat: Category) {
    setEditId(cat.id)
    setForm({ name: cat.name, description: cat.description ?? '', icon: cat.icon ?? '🔧' })
    setError('')
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditId(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Kategorien</h1>
        <button className="btn-primary gap-2" onClick={openCreate}>
          <Plus size={15} /> Neue Kategorie
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8 text-brand-600" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories?.map((cat) => (
            <div key={cat.id} className="card p-5 flex items-start gap-4">
              <span className="text-3xl leading-none mt-0.5">{cat.icon ?? '📦'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">{cat.name}</p>
                  {!cat.isActive && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inaktiv</span>
                  )}
                </div>
                {cat.description && (
                  <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{cat.description}</p>
                )}
                {cat.commissionRate != null && (
                  <p className="text-xs text-brand-600 mt-1 font-medium">{cat.commissionRate}% Provision</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                  onClick={() => openEdit(cat)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
                  onClick={() => setDeleteConfirm(cat.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal open={showModal} onClose={closeModal} title={editId ? 'Kategorie bearbeiten' : 'Neue Kategorie'}>
        <div className="space-y-4">
          <div>
            <label className="label">Name *</label>
            <input
              className="input"
              placeholder="z.B. Haushaltsdienstleistungen"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Beschreibung</label>
            <textarea
              className="input h-20 resize-none"
              placeholder="Kurzbeschreibung…"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Icon (Emoji)</label>
            <input
              className="input text-2xl"
              maxLength={4}
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={closeModal}>Abbrechen</button>
            <button
              className="btn-primary"
              disabled={saveMutation.isPending || !form.name.trim()}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : (editId ? 'Speichern' : 'Erstellen')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Kategorie löschen">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Diese Kategorie wirklich löschen? Bestehende Anfragen bleiben erhalten.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
            <button className="btn-danger" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteConfirm!)}>
              {deleteMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Löschen'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
