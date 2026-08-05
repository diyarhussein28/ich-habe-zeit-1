import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/api/admin.api'
import { PageSpinner } from '@/components/ui/Spinner'
import { StatCard } from '@/components/ui/StatCard'
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from '@/components/ui/Table'
import { formatEur } from '@/lib/utils'

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
}

const pct = (n: number) => `${(n * 100).toFixed(1)} %`

export default function Reports() {
  const [from, setFrom] = useState(isoDaysAgo(30))
  const [to, setTo] = useState(isoDaysAgo(0))

  const { data, isLoading } = useQuery({
    queryKey: ['admin-reports', from, to],
    queryFn: () => adminApi.getReports({ from, to }).then((r) => r.data),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Berichte &amp; Analysen</h1>
        <div className="flex items-center gap-2">
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-gray-400 text-sm">bis</span>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {isLoading || !data ? <PageSpinner /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <StatCard title="GMV (Zeitraum)" value={formatEur(data.gmv)} icon="💶" color="blue" />
            <StatCard title="Plattformumsatz" value={formatEur(data.platformRevenue)} icon="🏦" color="green" />
            <StatCard title="Ø Auftragswert" value={formatEur(data.averageOrderValue)} icon="📊" color="purple" />
            <StatCard title="Auftragsvolumen" value={data.orderVolume} sub={`${data.completedOrderVolume} abgeschlossen`} icon="📦" color="blue" />
            <StatCard title="Konversionsrate" value={pct(data.conversionRate)} sub="Anfrage → abgeschlossen" icon="🎯" color="green" />
            <StatCard title="Streitfallrate" value={pct(data.disputeRate)} sub="Ziel: < 3%" icon="⚖️" color={data.disputeRate > 0.03 ? 'red' : 'green'} />
            <StatCard title="Auto-Freigabe-Rate" value={pct(data.autoReleaseRate)} icon="⏱️" color="amber" />
            <StatCard title="Anbieter-Aktivierungsrate" value={pct(data.providerActivationRate)} icon="✅" color="purple" />
            <StatCard title="Ø KYC-Bearbeitungszeit" value={`${data.avgKycQueueHours.toFixed(1)} h`} icon="🕐" color="amber" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Kategorie-Performance</h2>
              </div>
              <Table>
                <Thead>
                  <tr><Th>Kategorie</Th><Th>GMV</Th><Th>Aufträge</Th><Th>Streitfälle</Th></tr>
                </Thead>
                <Tbody>
                  {data.categoryPerformance.length === 0 ? (
                    <EmptyRow cols={4} message="Keine Daten im Zeitraum" />
                  ) : (
                    data.categoryPerformance
                      .sort((a, b) => b.gmv - a.gmv)
                      .map((c) => (
                        <Tr key={c.categoryId}>
                          <Td className="font-medium text-gray-900">{c.name}</Td>
                          <Td>{formatEur(c.gmv)}</Td>
                          <Td>{c.orders}</Td>
                          <Td>{c.disputes}</Td>
                        </Tr>
                      ))
                  )}
                </Tbody>
              </Table>
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Stadt-Performance</h2>
              </div>
              <Table>
                <Thead>
                  <tr><Th>Stadt / PLZ</Th><Th>GMV</Th><Th>Aufträge</Th></tr>
                </Thead>
                <Tbody>
                  {data.cityPerformance.length === 0 ? (
                    <EmptyRow cols={3} message="Keine Daten im Zeitraum" />
                  ) : (
                    data.cityPerformance
                      .sort((a, b) => b.gmv - a.gmv)
                      .map((c) => (
                        <Tr key={c.city}>
                          <Td className="font-medium text-gray-900">{c.city}</Td>
                          <Td>{formatEur(c.gmv)}</Td>
                          <Td>{c.orders}</Td>
                        </Tr>
                      ))
                  )}
                </Tbody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
