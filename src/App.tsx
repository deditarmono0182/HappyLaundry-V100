import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { CustomersPage } from './pages/CustomersPage'
import { ServicesPage } from './pages/ServicesPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { OrdersPage } from './pages/OrdersPage'
import { ProductionPage } from './pages/ProductionPage'
import { PaymentsPage } from './pages/PaymentsPage'
import { CashPage } from './pages/CashPage'
import { CashierPage } from './pages/CashierPage'
import { SettingsPage } from './pages/SettingsPage'
import { useAuth } from './lib/auth'

function Protected() {
  const { session, loading } = useAuth()
  if (loading) return <div className="app-loading">Memuat HappyLaundry V100...</div>
  if (!session) return <Navigate to="/login" replace />
  return <AppLayout />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected />}>
        <Route index element={<DashboardPage />} />
        <Route path="cashier" element={<CashierPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="production" element={<ProductionPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="inventory" element={<PlaceholderPage title="Stok Bahan" description="Stok bahan dan minimum stok." />} />
        <Route path="suppliers" element={<PlaceholderPage title="Supplier" description="Supplier dan pembelian." />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="cash" element={<CashPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
