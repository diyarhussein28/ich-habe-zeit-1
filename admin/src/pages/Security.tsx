import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, ShieldOff, Copy } from 'lucide-react'
import { api } from '@/api/client'
import { authApi } from '@/api/admin.api'
import { Spinner, PageSpinner } from '@/components/ui/Spinner'
import { apiError } from '@/api/client'

type Step = 'idle' | 'setup' | 'recovery-codes'

export default function Security() {
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>('idle')
  const [secret, setSecret] = useState('')
  const [otpauthUri, setOtpauthUri] = useState('')
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [password, setPassword] = useState('')
  const [showDisable, setShowDisable] = useState(false)
  const [error, setError] = useState('')

  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-profile-security'],
    queryFn: () => api.get<{ profile: { mfaEnabled: boolean } }>('/api/profile').then((r) => r.data.profile),
  })

  const setupMutation = useMutation({
    mutationFn: () => authApi.mfaSetup(),
    onSuccess: (res) => {
      setSecret(res.data.secret)
      setOtpauthUri(res.data.otpauthUri)
      setStep('setup')
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  const verifyMutation = useMutation({
    mutationFn: () => authApi.mfaVerifySetup(code),
    onSuccess: (res) => {
      setRecoveryCodes(res.data.recoveryCodes)
      setStep('recovery-codes')
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  const disableMutation = useMutation({
    mutationFn: () => authApi.mfaDisable(password),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-profile-security'] })
      setShowDisable(false)
      setPassword('')
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  const finishSetup = () => {
    qc.invalidateQueries({ queryKey: ['my-profile-security'] })
    setStep('idle')
    setCode('')
  }

  if (isLoading || !profile) return <PageSpinner />

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Sicherheit</h1>

      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-3">
          {profile.mfaEnabled ? (
            <ShieldCheck className="text-green-600" size={22} />
          ) : (
            <ShieldOff className="text-amber-500" size={22} />
          )}
          <div>
            <h2 className="font-semibold text-gray-900">Zwei-Faktor-Authentifizierung (2FA)</h2>
            <p className="text-sm text-gray-500">
              {profile.mfaEnabled
                ? 'Aktiv — für Admin- und Support-Konten verpflichtend.'
                : 'Erforderlich, um auf das Admin-Panel zugreifen zu können.'}
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {profile.mfaEnabled && !showDisable && (
          <button className="btn-secondary" onClick={() => setShowDisable(true)}>
            2FA deaktivieren
          </button>
        )}

        {profile.mfaEnabled && showDisable && (
          <div className="space-y-3 rounded-lg border border-gray-200 p-4">
            <label className="label">Passwort zur Bestätigung</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                className="btn-danger"
                disabled={disableMutation.isPending}
                onClick={() => disableMutation.mutate()}
              >
                {disableMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Deaktivieren bestätigen'}
              </button>
              <button className="btn-secondary" onClick={() => { setShowDisable(false); setPassword('') }}>
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {!profile.mfaEnabled && step === 'idle' && (
          <button className="btn-primary" disabled={setupMutation.isPending} onClick={() => setupMutation.mutate()}>
            {setupMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : '2FA einrichten'}
          </button>
        )}

        {step === 'setup' && (
          <div className="space-y-4 rounded-lg border border-gray-200 p-4">
            <div>
              <p className="text-sm text-gray-700 mb-2">
                1. Öffne Google Authenticator (oder eine kompatible App) → <b>Konto hinzufügen</b> → <b>Setup-Schlüssel manuell eingeben</b>.
              </p>
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 font-mono text-sm">
                <span className="flex-1 tracking-wider">{secret}</span>
                <button
                  className="text-gray-400 hover:text-gray-700"
                  onClick={() => navigator.clipboard.writeText(secret)}
                  title="Kopieren"
                >
                  <Copy size={15} />
                </button>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-700 mb-2">2. Gib den 6-stelligen Code aus der App ein:</p>
              <div className="flex gap-2">
                <input
                  className="input w-40 text-center tracking-[0.3em] font-mono"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                />
                <button
                  className="btn-primary"
                  disabled={code.length !== 6 || verifyMutation.isPending}
                  onClick={() => verifyMutation.mutate()}
                >
                  {verifyMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Bestätigen'}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'recovery-codes' && (
          <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              Speichere diese Wiederherstellungscodes jetzt — sie werden nur einmal angezeigt.
            </p>
            <p className="text-xs text-amber-800">
              Jeder Code funktioniert einmal als Ersatz für den 6-stelligen App-Code, falls du dein Gerät verlierst.
            </p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-white rounded-lg p-3">
              {recoveryCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <button className="btn-primary" onClick={finishSetup}>
              Ich habe die Codes gespeichert
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
