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
        <Route path="/categories" element={<Categories />} />
        <Route path="/commission-rates" element={<CommissionRates />} />
        <Route path="/legal-docs" element={<LegalDocs />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
