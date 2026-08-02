import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  sub?: string
  icon: string
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple'
}

const colorClass = {
  blue:   'bg-brand-50 text-brand-600',
  green:  'bg-green-50 text-green-600',
  amber:  'bg-amber-50 text-amber-600',
  red:    'bg-red-50 text-red-600',
  purple: 'bg-purple-50 text-purple-600',
}

export function StatCard({ title, value, sub, icon, color = 'blue' }: StatCardProps) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl', colorClass[color])}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500">{title}</p>
        <p className="mt-1 text-2xl font-bold text-gray-900 truncate">{value}</p>
        {sub ? <p className="text-xs text-gray-400 mt-0.5">{sub}</p> : null}
      </div>
    </div>
  )
}
