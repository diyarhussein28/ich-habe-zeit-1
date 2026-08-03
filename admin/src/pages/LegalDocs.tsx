import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Save } from 'lucide-react'
import { adminApi } from '@/api/admin.api'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { formatDateTime } from '@/lib/utils'
import { apiError } from '@/api/client'

const DOC_LABELS: Record<string, string> = {
  AGB:         'Allgemeine Geschäftsbedingungen',
  DATENSCHUTZ: 'Datenschutzerklärung',
  IMPRESSUM:   'Impressum',
}

export default function LegalDocs() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const { data: docs, isLoading } = useQuery({
    queryKey: ['admin-legal-docs'],
    queryFn: () => adminApi.getLegalDocs().then((r) => r.data),
  })

  useEffect(() => {
    if (docs && docs.length > 0 && !activeTab) {
      setActiveTab(docs[0].type)
      setContent(docs[0].content)
    }
  }, [docs, activeTab])

  const updateMutation = useMutation({
    mutationFn: () => adminApi.updateLegalDoc(activeTab!, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-legal-docs'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  function handleTabClick(type: string, docContent: string) {
    setActiveTab(type)
    setContent(docContent)
    setError('')
    setSaved(false)
  }

  if (isLoading) return <PageSpinner />

  const activeDoc = docs?.find((d) => d.type === activeTab)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rechtliche Dokumente</h1>
          <p className="text-sm text-gray-500 mt-1">AGB, Datenschutz und weitere Pflichtinformationen</p>
        </div>
        <button
          className="btn-primary gap-2"
          disabled={updateMutation.isPending || !activeTab}
          onClick={() => updateMutation.mutate()}
        >
          {updateMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : <Save size={15} />}
          {saved ? 'Gespeichert ✓' : 'Speichern'}
        </button>
      </div>

      <div className="flex gap-5 min-h-[600px]">
        {/* Sidebar */}
        <div className="w-52 shrink-0 space-y-1">
          {docs?.map((doc) => (
            <button
              key={doc.type}
              onClick={() => handleTabClick(doc.type, doc.content)}
              className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                activeTab === doc.type
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FileText size={14} className="shrink-0" />
              <span className="truncate">{DOC_LABELS[doc.type] ?? doc.type}</span>
            </button>
          ))}
        </div>

        {/* Editor */}
        <div className="flex-1 card flex flex-col">
          {activeDoc ? (
            <>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">{DOC_LABELS[activeDoc.type] ?? activeDoc.type}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Zuletzt geändert: {activeDoc.updatedAt ? formatDateTime(activeDoc.updatedAt) : '—'}
                  </p>
                </div>
              </div>
              <div className="flex-1 p-4">
                <textarea
                  className="w-full h-full min-h-[480px] rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="Dokumentinhalt (Markdown oder Plaintext)…"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>
              {error && <p className="px-5 pb-4 text-sm text-red-600">{error}</p>}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Wähle ein Dokument aus der linken Liste
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
