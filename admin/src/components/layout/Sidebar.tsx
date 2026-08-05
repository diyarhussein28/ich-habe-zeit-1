import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Package, AlertTriangle,
  Tag, Percent, FileText, LogOut, ShieldCheck, LifeBuoy,
  BadgeCheck, Wallet, BarChart3, Settings as SettingsIcon, ScrollText, ShieldAlert,
} from 'lucide-react'
import { cn, initials } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { authApi } from '@/api/admin.api'

const nav = [
  { to: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/users',            icon: Users,            label: 'Benutzer' },
  { to: '/verifications',    icon: BadgeCheck,       label: 'Verifizierungen' },
  { to: '/orders',           icon: Package,          label: 'Bestellungen' },
  { to: '/transactions',     icon: Wallet,           label: 'Transaktionen' },
  { to: '/disputes',         icon: AlertTriangle,    label: 'Streitfälle' },
  { to: '/support',          icon: LifeBuoy,         label: 'Support' },
  { to: '/moderation',       icon: ShieldAlert,      label: 'Moderation' },
  { to: '/categories',       icon: Tag,              label: 'Kategorien' },
  { to: '/commission-rates', icon: Percent,          label: 'Provisionen' },
  { to: '/reports',          icon: BarChart3,        label: 'Berichte' },
  { to: '/legal-docs',       icon: FileText,         label: 'Rechtliches' },
  { to: '/audit-log',        icon: ScrollText,       label: 'Audit-Log' },
  { to: '/settings',         icon: SettingsIcon,     label: 'Einstellungen' },
  { to: '/security',         icon: ShieldCheck,      label: 'Sicherheit' },
]

export function Sidebar() {
  const { user, logout } = useAuthStore()

  const handleLogout = async () => {
    try { await authApi.logout() } catch {}
    logout()
  }

  return (
    <aside className="flex h-screen w-64 flex-col bg-gray-900 text-gray-100 fixed left-0 top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-800">
        <span className="text-2xl">⏰</span>
        <div>
          <p className="font-bold text-white leading-tight">Ich habe Zeit</p>
          <p className="text-xs text-gray-400">Admin Panel</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white',
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User + logout */}
      <div className="px-4 py-4 border-t border-gray-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white text-xs font-bold">
            {initials(user?.displayName)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.displayName}</p>
            <p className="text-xs text-gray-400">{user?.role === 'ADMIN' ? 'Administrator' : 'Support'}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut size={16} />
          Abmelden
        </button>
      </div>
    </aside>
  )
}
