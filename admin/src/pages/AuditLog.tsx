import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/api/admin.api'
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from '@/components/ui/Table'
import { PageSpinner } from '@/components/ui/Spinner'
import { formatDateTime } from '@/lib/utils'

export default function AuditLog() {
  const [actionType, setActionType] = useState('')
  const [page, setPage] = useState(1)
  const limit = 30

  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit-log', actionType, page],
    queryFn: () => adminApi.getAuditLogs({ actionType: actionType || undefined, page, limit }).then((r) => r.data),
    placeholderData: (prev) => prev,
  })

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Audit-Log</h1>

      <input
        className="input w-72"
        placeholder="Nach Aktionstyp filtern (z.B. USER_SUSPEND)…"
        value={actionType}
        onChange={(e) => { setActionType(e.target.value); setPage(1) }}
      />

      {isLoading ? <PageSpinner /> : (
        <div className="card overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th>Zeitpunkt</Th>
                <Th>Aktion</Th>
                <Th>Ausgeführt von</Th>
                <Th>Ziel</Th>
                <Th>IP</Th>
                <Th>Details</Th>
              </tr>
            </Thead>
            <Tbody>
              {data?.logs.length === 0 ? (
                <EmptyRow cols={6} message="Keine Einträge gefunden" />
              ) : (
                data?.logs.map((log) => (
                  <Tr key={log.id}>
                    <Td className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(log.createdAt)}</Td>
                    <Td>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-700">{log.actionType}</span>
                    </Td>
                    <Td className="text-sm">
                      {log.user ? (
                        <>
                          <p className="text-gray-900">{log.user.displayName}</p>
                          <p className="text-xs text-gray-400">{log.user.role}</p>
                        </>
                      ) : <span className="text-gray-400">System</span>}
                    </Td>
                    <Td className="text-sm text-gray-700">
                      {log.targetUser?.displayName ?? log.targetEntity ?? '—'}
                    </Td>
                    <Td className="text-xs text-gray-400 font-mono">{log.ipAddress ?? '—'}</Td>
                    <Td className="max-w-[240px]">
                      {log.metadata ? (
                        <pre className="text-[11px] text-gray-500 whitespace-pre-wrap break-all">{JSON.stringify(log.metadata)}</pre>
                      ) : '—'}
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>

          {data && data.total > limit && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-sm text-gray-500">{(page - 1) * limit + 1}–{Math.min(page * limit, data.total)} von {data.total}</p>
              <div className="flex gap-2">
                <button className="btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹ Zurück</button>
                <button className="btn-secondary btn-sm" disabled={page * limit >= data.total} onClick={() => setPage((p) => p + 1)}>Weiter ›</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
