import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, AlertTriangle } from 'lucide-react'
import { adminApi } from '@/api/admin.api'
import { StatCard } from '@/components/ui/StatCard'
import { PageSpinner } from '@/components/ui/Spinner'
import { KycBadge, OrderStatusBadge } from '@/components/ui/Badge'
import { formatEur, formatDateTime, initials } from '@/lib/utils'

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getStats().then((r) => r.data),
    refetchInterval: 30_000,
  })

  const { data: disputesData } = useQuery({
    queryKey: ['admin-disputes', 'OPEN'],
    queryFn: () => adminApi.getDisputes({ status: 'OPEN', limit: 5 }).then((r) => r.data),
  })

  const { data: kycData } = useQuery({
    queryKey: ['admin-users', 'KYC_PENDING'],
    queryFn: () => adminApi.getUsers({ verificationStatus: 'KYC_PENDING', limit: 5 }).then((r) => r.data),
  })

  if (isLoading) return <PageSpinner />
  if (!stats) return null

  const s = stats

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Plattformübersicht in Echtzeit</p>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard title="Gesamtbenutzer" value={s.totalUsers.toLocaleString('de-DE')} sub={`+${s.newUsersThisWeek} diese Woche`} icon="👥" color="blue" />
        <StatCard title="Dienstleister" value={s.totalProviders.toLocaleString('de-DE')} icon="🔧" color="purple" />
        <StatCard title="Bestellungen" value={s.totalOrders.toLocaleString('de-DE')} sub={`${s.activeOrders} aktiv`} icon="📦" color="green" />
        <StatCard title="Umsatz gesamt" value={formatEur(s.totalRevenue)} sub={`${formatEur(s.revenueThisMonth)} diesen Monat`} icon="💶" color="green" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard title="Offene Streitfälle" value={s.openDisputes} icon="⚠️" color={s.openDisputes > 0 ? 'red' : 'green'} />
        <StatCard title="Neue Aufträge" value={s.newOrdersThisWeek} sub="diese Woche" icon="📋" color="amber" />
      </div>

      {/* Two-column action area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Open disputes */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" />
              <h2 className="font-semibold text-gray-900">Offene Streitfälle</h2>
              {s.openDisputes > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                  {s.openDisputes}
                </span>
              )}
            </div>
            <Link to="/disputes" className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
              Alle <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {disputesData?.data.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">Keine offenen Streitfälle 🎉</p>
            ) : (
              disputesData?.data.map((d) => (
                <Link key={d.id} to={`/disputes/${d.id}`} className="flex items-start justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-gray-900 truncate max-w-[240px]">
                      {d.order.request?.title ?? `Bestellung #${d.orderId.slice(-6)}`}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[240px]">{d.reason}</p>
                    <p className="text-xs text-gray-400 mt-1">{formatDateTime(d.createdAt)}</p>
                  </div>
                  <ArrowRight size={14} className="text-gray-400 mt-1 shrink-0" />
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Pending KYC */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">KYC-Überprüfung ausstehend</h2>
            <Link to="/users?status=KYC_PENDING" className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
              Alle <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {kycData?.data.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">Keine ausstehenden KYC-Prüfungen</p>
            ) : (
              kycData?.data.map((u) => (
                <Link key={u.id} to={`/users?highlight=${u.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-bold">
                    {initials(u.displayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {u.displayName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  </div>
                  <KycBadge status={u.verificationStatus} />
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
