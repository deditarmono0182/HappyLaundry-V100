import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, ShoppingBag, Users, WashingMachine, Package, Truck, WalletCards, Settings, LogOut, Menu, X, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../lib/auth'

const items: Array<{ to: string; label: string; icon: typeof LayoutDashboard; roles: string[] }> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'cashier', 'staff'] },
  { to: '/orders', label: 'Order', icon: ShoppingBag, roles: ['owner', 'cashier'] },
  { to: '/production', label: 'Produksi', icon: WashingMachine, roles: ['owner', 'staff'] },
  { to: '/customers', label: 'Pelanggan', icon: Users, roles: ['owner', 'cashier'] },
  { to: '/services', label: 'Layanan & Harga', icon: Sparkles, roles: ['owner', 'cashier'] },
  { to: '/inventory', label: 'Stok Bahan', icon: Package, roles: ['owner', 'staff'] },
  { to: '/suppliers', label: 'Supplier', icon: Truck, roles: ['owner', 'staff'] },
  { to: '/cash', label: 'Kas Harian', icon: WalletCards, roles: ['owner', 'cashier'] },
  { to: '/settings', label: 'Pengaturan', icon: Settings, roles: ['owner'] }
]

export function AppLayout() {
  const [open, setOpen] = useState(false)
  const { profile, signOut } = useAuth()
  const role = profile?.role ?? 'staff'

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <img src="/logo-happylaundry.jpg" alt="HappyLaundry" />
          <div><strong>HappyLaundry</strong><span>Enterprise V100.2</span></div>
          <button className="icon-button mobile-only" onClick={() => setOpen(false)} aria-label="Tutup menu"><X size={20} /></button>
        </div>
        <nav>
          {items.filter(item => item.roles.includes(role)).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)}><Icon size={19} /><span>{label}</span></NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="account"><b>{profile?.full_name || 'Pengguna'}</b><span>{role.toUpperCase()}</span></div>
          <button className="signout-button" onClick={() => signOut()}><LogOut size={18} />Keluar</button>
        </div>
      </aside>
      {open && <button className="overlay" onClick={() => setOpen(false)} aria-label="Tutup menu" />}
      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setOpen(true)} aria-label="Buka menu"><Menu size={22} /></button>
          <div><span className="eyebrow">HAPPYLAUNDRY BABAKAN</span><h1>Sistem Operasional Laundry</h1></div>
          <div className="status-chip">● Online</div>
        </header>
        <div className="page-container"><Outlet /></div>
      </main>
    </div>
  )
}
