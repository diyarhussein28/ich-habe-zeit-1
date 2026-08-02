import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '@/components/ui/Spinner'
import { authApi } from '@/api/admin.api'
import { useAuthStore } from '@/store/auth.store'
import { apiError } from '@/api/client'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login(email.trim().toLowerCase(), password)
      const { token, user } = res.data
      if (!['ADMIN', 'HELP_DESK'].includes(user.role)) {
        setError('Kein Zugriff auf das Admin-Panel.')
        return
      }
      login(token, user)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
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
