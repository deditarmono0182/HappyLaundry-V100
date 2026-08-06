import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { useAuth } from './lib/auth'

const LoginPage=lazy(()=>import('./pages/LoginPage').then(m=>({default:m.LoginPage})))
const DashboardPage=lazy(()=>import('./pages/DashboardPage').then(m=>({default:m.DashboardPage})))
const CustomersPage=lazy(()=>import('./pages/CustomersPage').then(m=>({default:m.CustomersPage})))
const ServicesPage=lazy(()=>import('./pages/ServicesPage').then(m=>({default:m.ServicesPage})))
const PlaceholderPage=lazy(()=>import('./pages/PlaceholderPage').then(m=>({default:m.PlaceholderPage})))
const OrdersPage=lazy(()=>import('./pages/OrdersPage').then(m=>({default:m.OrdersPage})))
const ProductionPage=lazy(()=>import('./pages/ProductionPage').then(m=>({default:m.ProductionPage})))
const PaymentsPage=lazy(()=>import('./pages/PaymentsPage').then(m=>({default:m.PaymentsPage})))
const CashPage=lazy(()=>import('./pages/CashPage').then(m=>({default:m.CashPage})))
const CashierPage=lazy(()=>import('./pages/CashierPage').then(m=>({default:m.CashierPage})))
const SettingsPage=lazy(()=>import('./pages/SettingsPage').then(m=>({default:m.SettingsPage})))
const ReportsPage=lazy(()=>import('./pages/ReportsPage').then(m=>({default:m.ReportsPage})))
const PublicTrackingPage=lazy(()=>import('./pages/PublicTrackingPage').then(m=>({default:m.PublicTrackingPage})))
const BackupPage=lazy(()=>import('./pages/BackupPage').then(m=>({default:m.BackupPage})))

function Protected(){
  const {session,loading}=useAuth()
  if(loading)return <div className="app-loading">Memuat HappyLaundry V103...</div>
  if(!session)return <Navigate to="/login" replace/>
  return <AppLayout/>
}

const loading=<div className="route-loading"><span/>Memuat halaman...</div>

export default function App(){
  return <Suspense fallback={loading}><Routes>
    <Route path="/login" element={<LoginPage/>}/>
    <Route path="/track/:orderNo?" element={<PublicTrackingPage/>}/>
    <Route element={<Protected/>}>
      <Route index element={<DashboardPage/>}/>
      <Route path="cashier" element={<CashierPage/>}/>
      <Route path="orders" element={<OrdersPage/>}/>
      <Route path="production" element={<ProductionPage/>}/>
      <Route path="customers" element={<CustomersPage/>}/>
      <Route path="services" element={<ServicesPage/>}/>
      <Route path="inventory" element={<PlaceholderPage title="Stok Bahan" description="Stok bahan dan minimum stok."/>}/>
      <Route path="suppliers" element={<PlaceholderPage title="Supplier" description="Supplier dan pembelian."/>}/>
      <Route path="payments" element={<PaymentsPage/>}/>
      <Route path="cash" element={<CashPage/>}/>
      <Route path="reports" element={<ReportsPage/>}/>
      <Route path="backup" element={<BackupPage/>}/>
      <Route path="settings" element={<SettingsPage/>}/>
    </Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></Suspense>
}
