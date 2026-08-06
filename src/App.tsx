import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { CustomersPage } from './pages/CustomersPage'
import { ServicesPage } from './pages/ServicesPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
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
        <Route path="orders" element={<PlaceholderPage title="Order" description="Order baru, pembayaran, dan nota 58 mm." />} />
        <Route path="production" element={<PlaceholderPage title="Produksi" description="Cuci, kering, setrika, packing, siap diambil." />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="inventory" element={<PlaceholderPage title="Stok Bahan" description="Stok bahan dan minimum stok." />} />
        <Route path="suppliers" element={<PlaceholderPage title="Supplier" description="Supplier dan pembelian." />} />
        <Route path="cash" element={<PlaceholderPage title="Kas Harian" description="Buka kas, pemasukan, dan pengeluaran." />} />
        <Route path="settings" element={<PlaceholderPage title="Pengaturan" description="Profil usaha, jam operasional, Maps, WhatsApp, dan user." />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
