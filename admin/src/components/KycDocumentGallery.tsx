import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/api/admin.api'
import { Spinner } from '@/components/ui/Spinner'
import type { KycDocument } from '@/api/types'

const KYC_DOC_LABEL: Record<string, string> = {
  ID_FRONT: 'Ausweis (Vorderseite)',
  ID_BACK: 'Ausweis (Rückseite)',
  SELFIE_WITH_ID: 'Selfie mit Ausweis',
}

export function KycDocumentGallery({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-kyc-documents', userId],
    queryFn: () => adminApi.getUserKycDocuments(userId).then((r) => r.data.documents),
  })
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!data) return
    let cancelled = false
    const objectUrls: string[] = []

    Promise.all(
      data.map(async (doc: KycDocument) => {
        const url = await adminApi.getKycDocumentFileUrl(doc.id)
        objectUrls.push(url)
        return [doc.id, url] as const
      })
    ).then((pairs) => {
      if (!cancelled) setUrls(Object.fromEntries(pairs))
    })

    return () => {
      cancelled = true
      objectUrls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [data])

  if (isLoading) return <p className="text-sm text-gray-500">Dokumente werden geladen…</p>
  if (!data || data.length === 0) return <p className="text-sm text-gray-500">Keine Dokumente hochgeladen.</p>

  return (
    <div className="grid grid-cols-3 gap-3">
      {data.map((doc) => {
        const url = urls[doc.id]
        return (
          <a
            key={doc.id}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg border border-gray-200 overflow-hidden hover:border-brand-400"
          >
            <div className="aspect-square bg-gray-100 flex items-center justify-center">
              {!url ? (
                <Spinner className="h-5 w-5" />
              ) : doc.mimeType === 'application/pdf' ? (
                <span className="text-xs text-gray-500">PDF öffnen</span>
              ) : (
                <img src={url} alt={KYC_DOC_LABEL[doc.type] ?? doc.type} className="h-full w-full object-cover" />
              )}
            </div>
            <p className="px-2 py-1.5 text-[11px] text-gray-600 truncate">{KYC_DOC_LABEL[doc.type] ?? doc.type}</p>
          </a>
        )
      })}
    </div>
  )
}
