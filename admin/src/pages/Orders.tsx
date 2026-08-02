import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/api/admin.api'
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from '@/components/ui/Table'
import { OrderStatusBadge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { formatDate, formatEur } from '@/lib/utils'

export default function Orders() {
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orders', statusFilter, page],
    queryFn: () =>
      adminApi.getOrders({ status: statusFilter || undefined, page, limit: 25 }).then((r) => r.data),
    placeholderData: (prev) => prev,
  })

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Bestellungen</h1>

      <div className="flex gap-3">
        <select className="input w-52" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">Alle Status</option>
          <option value="DISPUTED">Streitfall</option>
          <option value="IN_PROGRESS">Aktiv</option>
          <option value="AWAITING_RELEASE">Freigabe ausstehend</option>
          <option value="RELEASED">Ausgezahlt</option>
          <option value="CANCELLED">Abgebrochen</option>
        </select>
      </div>

      {isLoading ? <PageSpinner /> : (
        <div className="card overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th>Leistung</Th>
                <Th>Auftraggeber</Th>
                <Th>Dienstleister</Th>
                <Th>Betrag</Th>
                <Th>Status</Th>
                <Th>Datum</Th>
              </tr>
            </Thead>
            <Tbody>
              {data?.data.length === 0 ? (
                <EmptyRow cols={6} message="Keine Bestellungen gefunden" />
              ) : (
                data?.data.map((order) => (
                  <Tr key={order.id}>
                    <Td>
                      <p className="font-medium text-gray-900 max-w-[200px] truncate">{order.request?.title}</p>
                      <p className="text-xs text-gray-400">{order.request?.category?.name}</p>
                    </Td>
                    <Td>
                      <p className="text-sm">{order.customer.displayName}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[140px]">{order.customer.email}</p>
                    </Td>
                    <Td>
                      <p className="text-sm">{order.provider.displayName}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[140px]">{order.provider.email}</p>
                    </Td>
                    <Td>
                      <p className="font-semibold text-gray-900">{formatEur(order.totalAmount)}</p>
                      <p className="text-xs text-gray-400">Gebühr: {formatEur(order.platformFee)}</p>
                    </Td>
                    <Td><OrderStatusBadge status={order.status} /></Td>
                    <Td className="text-xs text-gray-500">{formatDate(order.createdAt)}</Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>

          {data && data.total > 25 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-sm text-gray-500">{(page - 1) * 25 + 1}–{Math.min(page * 25, data.total)} von {data.total}</p>
              <div className="flex gap-2">
                <button className="btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹</button>
                <button className="btn-secondary btn-sm" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>›</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
