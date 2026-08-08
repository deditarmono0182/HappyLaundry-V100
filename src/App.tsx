import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { PermissionRoute } from './components/PermissionRoute'
import { useAuth } from './lib/auth'

const LoginPage=lazy(()=>import('./pages/LoginPage').then(m=>({default:m.LoginPage})))
const DashboardPage=lazy(()=>import('./pages/DashboardPage').then(m=>({default:m.DashboardPage})))
const CustomersPage=lazy(()=>import('./pages/CustomersPage').then(m=>({default:m.CustomersPage})))
const ServicesPage=lazy(()=>import('./pages/ServicesPage').then(m=>({default:m.ServicesPage})))
const PlaceholderPage=lazy(()=>import('./pages/PlaceholderPage').then(m=>({default:m.PlaceholderPage})))
const InventoryPage=lazy(()=>import('./pages/InventoryPage').then(m=>({default:m.InventoryPage})))
const SuppliersPage=lazy(()=>import('./pages/SuppliersPage').then(m=>({default:m.SuppliersPage})))
const OrdersPage=lazy(()=>import('./pages/OrdersPage').then(m=>({default:m.OrdersPage})))
const ProductionPage=lazy(()=>import('./pages/ProductionPage').then(m=>({default:m.ProductionPage})))
const PaymentsPage=lazy(()=>import('./pages/PaymentsPage').then(m=>({default:m.PaymentsPage})))
const CashPage=lazy(()=>import('./pages/CashPage').then(m=>({default:m.CashPage})))
const CashierPage=lazy(()=>import('./pages/CashierPage').then(m=>({default:m.CashierPage})))
const SettingsPage=lazy(()=>import('./pages/SettingsPage').then(m=>({default:m.SettingsPage})))
const PrintSettingsPage=lazy(()=>import('./pages/PrintSettingsPage').then(m=>({default:m.PrintSettingsPage})))
const EmployeesPage=lazy(()=>import('./pages/EmployeesPage').then(m=>({default:m.EmployeesPage})))
const PayrollPage=lazy(()=>import('./pages/PayrollPage').then(m=>({default:m.PayrollPage})))
const UserAuditPage=lazy(()=>import('./pages/UserAuditPage').then(m=>({default:m.UserAuditPage})))
const ReportsPage=lazy(()=>import('./pages/ReportsPage').then(m=>({default:m.ReportsPage})))
const FinancePage=lazy(()=>import('./pages/FinancePage').then(m=>({default:m.FinancePage})))
const IncomeDetailsPage=lazy(()=>import('./pages/IncomeDetailsPage').then(m=>({default:m.IncomeDetailsPage})))
const ExpenseDetailsPage=lazy(()=>import('./pages/ExpenseDetailsPage').then(m=>({default:m.ExpenseDetailsPage})))
const ReceivablesPage=lazy(()=>import('./pages/ReceivablesPage').then(m=>({default:m.ReceivablesPage})))
const PublicTrackingPage=lazy(()=>import('./pages/PublicTrackingPage').then(m=>({default:m.PublicTrackingPage})))
const BackupPage=lazy(()=>import('./pages/BackupPage').then(m=>({default:m.BackupPage})))
const QRScannerPage=lazy(()=>import('./pages/QRScannerPage').then(m=>({default:m.QRScannerPage})))
const AttendancePage=lazy(()=>import('./pages/AttendancePage').then(m=>({default:m.AttendancePage})))
const AttendanceSettingsPage=lazy(()=>import('./pages/AttendanceSettingsPage').then(m=>({default:m.AttendanceSettingsPage})))

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
      <Route index element={<PermissionRoute permission="dashboard"><DashboardPage/></PermissionRoute>}/>
      <Route path="cashier" element={<PermissionRoute permission="cashier"><CashierPage/></PermissionRoute>}/>
      <Route path="orders" element={<PermissionRoute permission="orders"><OrdersPage/></PermissionRoute>}/>
      <Route path="qr-scan" element={<PermissionRoute permission="qr_center"><QRScannerPage/></PermissionRoute>}/>
      <Route path="production" element={<PermissionRoute permission="production"><ProductionPage/></PermissionRoute>}/>
      <Route path="customers" element={<PermissionRoute permission="customers"><CustomersPage/></PermissionRoute>}/>
      <Route path="services" element={<PermissionRoute permission="services"><ServicesPage/></PermissionRoute>}/>
      <Route path="inventory" element={<InventoryPage/>}/>
      <Route path="suppliers" element={<SuppliersPage/>}/>
      <Route path="payments" element={<PermissionRoute permission="payments"><PaymentsPage/></PermissionRoute>}/>
      <Route path="cash" element={<PermissionRoute permission="cash"><CashPage/></PermissionRoute>}/>
      <Route path="finance" element={<PermissionRoute permission="finance"><FinancePage/></PermissionRoute>}/>
      <Route path="finance/income" element={<IncomeDetailsPage/>}/>
      <Route path="finance/expenses" element={<ExpenseDetailsPage/>}/>
      <Route path="receivables" element={<PermissionRoute permission="receivables"><ReceivablesPage/></PermissionRoute>}/>
      <Route path="reports" element={<PermissionRoute permission="reports"><ReportsPage/></PermissionRoute>}/>
      <Route path="backup" element={<PermissionRoute permission="backup"><BackupPage/></PermissionRoute>}/>
      <Route path="settings" element={<PermissionRoute permission="settings"><SettingsPage/></PermissionRoute>}/>
      <Route path="settings/print" element={<PermissionRoute permission="settings"><PrintSettingsPage/></PermissionRoute>}/>
      <Route path="settings/employees" element={<EmployeesPage/>}/>
      <Route path="payroll" element={<PayrollPage/>}/>
      <Route path="attendance" element={<AttendancePage/>}/>
      <Route path="settings/attendance" element={<AttendanceSettingsPage/>}/>
      <Route path="settings/audit" element={<UserAuditPage/>}/>
    </Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></Suspense>
}
