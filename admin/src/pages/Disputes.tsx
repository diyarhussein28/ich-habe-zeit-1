import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { adminApi } from '@/api/admin.api'
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from '@/components/ui/Table'
import { DisputeStatusBadge, DISPUTE_REASON_CATEGORY_LABEL } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { formatDateTime, formatEur } from '@/lib/utils'

export default function Disputes() {
  const [statusFilter, setStatusFilter] = useState('OPEN')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-disputes', statusFilter, page],
    queryFn: () =>
      adminApi.getDisputes({ status: statusFilter || undefined, page, limit: 20 }).then((r) => r.data),
    placeholderData: (prev) => prev,
  })

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Streitfälle</h1>

      <div className="flex gap-3">
        <select className="input w-44" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">Alle offenen</option>
          <option value="OPEN">Offen</option>
          <option value="IN_REVIEW">In Prüfung</option>
          <option value="PENDING_DECISION">Entscheidung ausstehend</option>
          <option value="ESCALATED">Eskaliert</option>
          <option value="RESOLVED">Gelöst</option>
        </select>
      </div>

      {isLoading ? <PageSpinner /> : (
        <div className="card overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th>Streitfall</Th>
                <Th>Auftraggeber</Th>
                <Th>Dienstleister</Th>
                <Th>Betrag</Th>
                <Th>Status</Th>
                <Th>Geöffnet</Th>
                <Th></Th>
              </tr>
            </Thead>
            <Tbody>
              {data?.data.length === 0 ? (
                <EmptyRow cols={7} message="Keine Streitfälle" />
              ) : (
                data?.data.map((d) => (
                  <Tr key={d.id}>
                    <Td>
                      <p className="font-medium text-gray-900 max-w-[200px] truncate">
                        {d.order.request?.title ?? `#${d.orderId.slice(-6)}`}
                      </p>
                      <p className="text-xs text-gray-400 max-w-[200px] truncate">
                        {DISPUTE_REASON_CATEGORY_LABEL[d.reasonCategory] ?? d.reasonCategory}
                      </p>
                    </Td>
                    <Td className="text-sm">{d.order.customer.displayName}</Td>
                    <Td className="text-sm">{d.order.provider.displayName}</Td>
                    <Td className="font-semibold">{formatEur(d.order.totalAmount)}</Td>
                    <Td>
                      <DisputeStatusBadge status={d.status} />
                    </Td>
                    <Td className="text-xs text-gray-500">{formatDateTime(d.createdAt)}</Td>
                    <Td>
                      <Link to={`/disputes/${d.id}`} className="btn btn-secondary btn-sm gap-1">
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
