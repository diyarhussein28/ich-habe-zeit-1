import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { adminApi } from '@/api/admin.api'
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { formatDateTime } from '@/lib/utils'

const statusVariant = (s: string) => {
  if (s === 'OPEN') return 'danger' as const
  if (s === 'IN_PROGRESS') return 'warning' as const
  if (s === 'RESOLVED') return 'success' as const
  return 'neutral' as const
}

const statusLabel: Record<string, string> = {
  OPEN: 'Offen',
  IN_PROGRESS: 'In Bearbeitung',
  RESOLVED: 'Gelöst',
  CLOSED: 'Geschlossen',
}

export default function Support() {
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-support-tickets', statusFilter, page],
    queryFn: () =>
      adminApi.getSupportTickets({ status: statusFilter || undefined, page, limit: 20 }).then((r) => r.data),
    placeholderData: (prev) => prev,
  })

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Support-Anfragen</h1>

      <div className="flex gap-3">
        <select className="input w-48" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">Offen &amp; In Bearbeitung</option>
          <option value="OPEN">Offen</option>
          <option value="IN_PROGRESS">In Bearbeitung</option>
          <option value="RESOLVED">Gelöst</option>
          <option value="CLOSED">Geschlossen</option>
        </select>
      </div>

      {isLoading ? <PageSpinner /> : (
        <div className="card overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th>Betreff</Th>
                <Th>Von</Th>
                <Th>Status</Th>
                <Th>Erstellt</Th>
                <Th></Th>
              </tr>
            </Thead>
            <Tbody>
              {data?.data.length === 0 ? (
                <EmptyRow cols={5} message="Keine Support-Anfragen" />
              ) : (
                data?.data.map((t) => (
                  <Tr key={t.id}>
                    <Td>
                      <p className="font-medium text-gray-900 max-w-[280px] truncate">{t.subject}</p>
                      <p className="text-xs text-gray-400 max-w-[280px] truncate">{t.description}</p>
                    </Td>
                    <Td className="text-sm">
                      <p className="text-gray-900">{t.user?.displayName ?? '—'}</p>
                      <p className="text-xs text-gray-400">{t.user?.email}</p>
                    </Td>
                    <Td><Badge label={statusLabel[t.status] ?? t.status} variant={statusVariant(t.status)} /></Td>
                    <Td className="text-xs text-gray-500">{formatDateTime(t.createdAt)}</Td>
                    <Td>
                      <Link to={`/support/${t.id}`} className="btn btn-secondary btn-sm gap-1">
                        Öffnen <ArrowRight size={12} />
                      </Link>
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        </div>
      )}
    </div>
  )
}
