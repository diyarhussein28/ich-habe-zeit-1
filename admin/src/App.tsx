import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { useAuthStore } from '@/store/auth.store'
import { setUnauthorizedHandler } from '@/api/client'

import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Users from '@/pages/Users'
import Orders from '@/pages/Orders'
import Disputes from '@/pages/Disputes'
import DisputeDetail from '@/pages/DisputeDetail'
import Categories from '@/pages/Categories'
import CommissionRates from '@/pages/CommissionRates'
import LegalDocs from '@/pages/LegalDocs'
import Security from '@/pages/Security'
import Support from '@/pages/Support'
import SupportDetail from '@/pages/SupportDetail'
import Verifications from '@/pages/Verifications'
import Transactions from '@/pages/Transactions'
import Reports from '@/pages/Reports'
import Settings from '@/pages/Settings'
import AuditLog from '@/pages/AuditLog'
import Moderation from '@/pages/Moderation'

export default function App() {
  const { logout } = useAuthStore()

  useEffect(() => {
    setUnauthorizedHandler(() => logout())
  }, [logout])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/users" element={<Users />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/disputes" element={<Disputes />} />
        <Route path="/disputes/:id" element={<DisputeDetail />} />
        <Route path="/verifications" element={<Verifications />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/commission-rates" element={<CommissionRates />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/moderation" element={<Moderation />} />
        <Route path="/legal-docs" element={<LegalDocs />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="/security" element={<Security />} />
        <Route path="/support" element={<Support />} />
        <Route path="/support/:id" element={<SupportDetail />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
