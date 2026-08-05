import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/api/admin.api'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { apiError } from '@/api/client'

const SETTING_META: Record<string, { label: string; hint: string; kind: 'number' | 'json' }> = {
  otp_expires_in_minutes: { label: 'OTP-Gültigkeit (Minuten)', hint: 'Wie lange ein Verifizierungscode gültig bleibt.', kind: 'number' },
  otp_max_retries: { label: 'Max. OTP-Versuche', hint: 'Nach wie vielen Fehlversuchen ein Code gesperrt wird.', kind: 'number' },
  default_release_window_hours: { label: 'Freigabefenster (Stunden)', hint: 'Zeit bis zur automatischen Zahlungsfreigabe nach Abschluss.', kind: 'number' },
  kyc_document_types: { label: 'KYC-Dokumenttypen', hint: 'Akzeptierte Dokumenttypen (JSON-Array).', kind: 'json' },
  feature_flags: { label: 'Feature-Flags', hint: 'Beliebige Plattform-Flags (JSON-Objekt).', kind: 'json' },
}

export default function Settings() {
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [savedKey, setSavedKey] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => adminApi.getSettings().then((r) => r.data.settings),
  })

  useEffect(() => {
    if (!data) return
    const next: Record<string, string> = {}
    for (const s of data) {
      next[s.key] = SETTING_META[s.key]?.kind === 'json' ? JSON.stringify(s.value, null, 2) : String(s.value)
    }
    setDrafts(next)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: async (key: string) => {
      const meta = SETTING_META[key]
      const raw = drafts[key]
      const value = meta?.kind === 'number' ? Number(raw) : JSON.parse(raw)
      return adminApi.updateSetting(key, value)
    },
    onSuccess: (_res, key) => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      setError('')
      setSavedKey(key)
      setTimeout(() => setSavedKey(null), 2000)
    },
    onError: (err) => setError(apiError(err)),
  })

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Systemeinstellungen</h1>
        <p className="text-sm text-gray-500 mt-1">Änderungen wirken sofort — kein Deployment nötig.</p>
      </div>

      {isLoading || !data ? <PageSpinner /> : (
        <div className="space-y-4">
          {data.map((setting) => {
            const meta = SETTING_META[setting.key] ?? { label: setting.key, hint: '', kind: 'json' as const }
            return (
              <div key={setting.key} className="card p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="label mb-0">{meta.label}</label>
                  {!setting.isOverridden && <span className="text-xs text-gray-400">Standardwert</span>}
                  {savedKey === setting.key && <span className="text-xs text-green-600 font-medium">Gespeichert ✓</span>}
                </div>
                <p className="text-xs text-gray-400">{meta.hint}</p>
                {meta.kind === 'json' ? (
                  <textarea
                    className="input h-24 font-mono text-xs resize-none"
                    value={drafts[setting.key] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [setting.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    type="number"
                    className="input w-40"
                    value={drafts[setting.key] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [setting.key]: e.target.value }))}
                  />
                )}
                <div className="flex justify-end">
                  <button
                    className="btn-primary btn-sm"
                    disabled={saveMutation.isPending}
                    onClick={() => saveMutation.mutate(setting.key)}
                  >
                    {saveMutation.isPending ? <Spinner className="h-3.5 w-3.5 text-white" /> : 'Speichern'}
                  </button>
                </div>
              </div>
            )
          })}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
