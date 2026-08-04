import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '@/components/ui/Spinner'
import { authApi } from '@/api/admin.api'
import { useAuthStore } from '@/store/auth.store'
import { apiError } from '@/api/client'
import type { AdminUser } from '@/api/types'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')

  const completeLogin = (token: string, user: AdminUser) => {
    if (!['ADMIN', 'HELP_DESK'].includes(user.role)) {
      setError('Kein Zugriff auf das Admin-Panel.')
      return
    }
    login(token, user)
    navigate('/dashboard', { replace: true })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login(email.trim().toLowerCase(), password)
      if ('mfaRequired' in res.data) {
        setChallengeToken(res.data.challengeToken)
        return
      }
      completeLogin(res.data.token, res.data.user)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleMfaSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.mfaChallenge(challengeToken!, mfaCode.trim())
      completeLogin(res.data.token, res.data.user)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }

  if (challengeToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <span className="text-5xl">⏰</span>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Ich habe Zeit</h1>
            <p className="text-sm text-gray-500 mt-1">Zwei-Faktor-Code eingeben</p>
          </div>
          <div className="card p-8">
            <form onSubmit={handleMfaSubmit} className="space-y-5">
              <div>
                <label className="label">6-stelliger Code oder Wiederherstellungscode</label>
                <input
                  className="input text-center tracking-[0.3em] font-mono"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading} className="btn-primary w-full h-10">
                {loading ? <Spinner className="h-4 w-4 text-white" /> : 'Bestätigen'}
              </button>
              <button
                type="button"
                className="text-sm text-gray-500 hover:text-gray-700 w-full text-center"
                onClick={() => { setChallengeToken(null); setMfaCode(''); setError('') }}
              >
                Zurück zur Anmeldung
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-5xl">⏰</span>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Ich habe Zeit</h1>
          <p className="text-sm text-gray-500 mt-1">Admin Panel</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">E-Mail</label>
              <input
                type="email"
                className="input"
                placeholder="admin@ichhabezeit.de"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label">Passwort</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full h-10">
              {loading ? <Spinner className="h-4 w-4 text-white" /> : 'Anmelden'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Nur für Administratoren und Support-Mitarbeiter
        </p>
      </div>
    </div>
  )
}
