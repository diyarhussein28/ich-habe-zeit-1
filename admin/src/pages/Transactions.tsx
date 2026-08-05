import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { adminApi } from '@/api/admin.api'
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from '@/components/ui/Table'
import { OrderStatusBadge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { formatDateTime, formatEur } from '@/lib/utils'

const STATUS_OPTIONS = [
  '', 'AWAITING_PAYMENT', 'IN_PROGRESS', 'AWAITING_RELEASE', 'RELEASED', 'PARTIALLY_RELEASED', 'REFUNDED', 'DISPUTED', 'CANCELLED',
]

export default function Transactions() {
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 25

  const { data, isLoading } = useQuery({
    queryKey: ['admin-transactions', status, offset],
    queryFn: () => adminApi.getTransactions({ status: status || undefined, limit, offset }).then((r) => r.data),
    placeholderData: (prev) => prev,
  })

  const fraudCount =
    (data?.fraudSignals.repeatedFailedPaymentUserIds.length ?? 0) +
    (data?.fraudSignals.highDisputeProviderIds.length ?? 0)

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Transaktionsüberwachung</h1>

      {fraudCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            {data?.fraudSignals.repeatedFailedPaymentUserIds.length ? (
              <>{data.fraudSignals.repeatedFailedPaymentUserIds.length} Nutzer mit wiederholten fehlgeschlagenen Zahlungen. </>
            ) : null}
            {data?.fraudSignals.highDisputeProviderIds.length ? (
              <>{data.fraudSignals.highDisputeProviderIds.length} Anbieter mit auffällig vielen Streitfällen.</>
            ) : null}
          </p>
        </div>
      )}

      <select className="input w-56" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0) }}>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>{s || 'Alle Status'}</option>
        ))}
      </select>

      {isLoading ? <PageSpinner /> : (
        <div className="card overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th>Auftraggeber</Th>
                <Th>Dienstleister</Th>
                <Th>Status</Th>
                <Th>Brutto</Th>
                <Th>Provision</Th>
                <Th>Ausgezahlt / Erstattet</Th>
                <Th>Stripe-Referenzen</Th>
                <Th>Aktualisiert</Th>
              </tr>
            </Thead>
            <Tbody>
              {data?.transactions.length === 0 ? (
                <EmptyRow cols={8} message="Keine Transaktionen gefunden" />
              ) : (
                data?.transactions.map((tx) => (
                  <Tr key={tx.id} className={tx.isFlaggedForFraud ? 'bg-red-50/50' : undefined}>
                    <Td>
                      <p className="font-medium text-gray-900">{tx.customer.displayName}</p>
                      <p className="text-xs text-gray-400">{tx.customer.email}</p>
                    </Td>
                    <Td className="text-gray-700">{tx.provider.displayName}</Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <OrderStatusBadge status={tx.status} />
                        {tx.isFlaggedForFraud && <AlertTriangle size={13} className="text-red-500" />}
                      </div>
                    </Td>
                    <Td className="font-medium">{formatEur(tx.grossAmount)}</Td>
                    <Td className="text-gray-500">{formatEur(tx.commissionAmount)}</Td>
                    <Td className="text-xs text-gray-500">
                      {tx.releasedAmount ? <>+{formatEur(tx.releasedAmount)}</> : null}
                      {tx.refundedAmount ? <> / -{formatEur(tx.refundedAmount)}</> : null}
                      {!tx.releasedAmount && !tx.refundedAmount ? '—' : null}
                    </Td>
                    <Td className="text-[11px] text-gray-400 font-mono">
                      {tx.stripePaymentIntentId?.slice(0, 18) ?? '—'}
                    </Td>
                    <Td className="text-xs text-gray-500">{formatDateTime(tx.updatedAt)}</Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>

          {data && data.total > limit && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-sm text-gray-500">{offset + 1}–{Math.min(offset + limit, data.total)} von {data.total}</p>
              <div className="flex gap-2">
                <button className="btn-secondary btn-sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))}>‹ Zurück</button>
                <button className="btn-secondary btn-sm" disabled={offset + limit >= data.total} onClick={() => setOffset((o) => o + limit)}>Weiter ›</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
