import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, ShoppingBag, Users, WashingMachine, Package, Truck, WalletCards,
  CreditCard, Settings, LogOut, Menu, X, Sparkles, Calculator, BarChart3, DatabaseBackup, QrCode, CircleDollarSign, AlertTriangle, CalendarCheck2, ScanLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { canAccess, type PermissionKey } from '../lib/permissions'
import { PWAInstallButton } from '../components/PWAInstallButton'

const items: Array<{ to: string; label: string; icon: typeof LayoutDashboard; roles?: string[]; permission?: PermissionKey }> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard' },
  { to: '/cashier', label: 'Kasir', icon: Calculator, permission: 'cashier' },
  { to: '/orders', label: 'Order', icon: ShoppingBag, permission: 'orders' },
  { to: '/qr-scan', label: 'QR Center', icon: QrCode, permission: 'qr_center' },
  { to: '/production', label: 'Produksi', icon: WashingMachine, permission: 'production' },
  { to: '/customers', label: 'Pelanggan', icon: Users, permission: 'customers' },
  { to: '/services', label: 'Layanan & Harga', icon: Sparkles, permission: 'services' },
  { to: '/inventory', label: 'Stok Bahan', icon: Package, roles: ['owner', 'staff'] },
  { to: '/suppliers', label: 'Supplier', icon: Truck, roles: ['owner', 'staff'] },
  { to: '/payments', label: 'Pembayaran', icon: CreditCard, permission: 'payments' },
  { to: '/cash', label: 'Kas Harian', icon: WalletCards, roles: ['owner', 'cashier'] },
  { to: '/finance', label: 'Keuangan', icon: CircleDollarSign, permission: 'finance' },
  { to: '/receivables', label: 'Piutang', icon: AlertTriangle, permission: 'receivables' },
  { to: '/reports', label: 'Laporan Owner', icon: BarChart3, permission: 'reports' },
  { to: '/attendance', label: 'Absen', icon: ScanLine, roles: ['employee'] },
  { to: '/payroll', label: 'Absensi & Gaji', icon: CalendarCheck2, roles: ['owner'] },
  { to: '/backup', label: 'Backup Data', icon: DatabaseBackup, permission: 'backup' },
  { to: '/settings', label: 'Pengaturan', icon: Settings, permission: 'settings' }
]

export function AppLayout() {
  const [open,setOpen]=useState(false)
  const [online,setOnline]=useState(navigator.onLine)

  useEffect(()=>{
    const yes=()=>setOnline(true)
    const no=()=>setOnline(false)
    window.addEventListener('online',yes);window.addEventListener('offline',no)
    return()=>{window.removeEventListener('online',yes);window.removeEventListener('offline',no)}
  },[])

  useEffect(()=>{
    const prepare=(root:ParentNode=document)=>{
      root.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach(input=>{
        input.inputMode='decimal'
        input.setAttribute('enterkeyhint','done')
        input.classList.add('flex-number-input')
      })
    }

    const handleFocus=(event:FocusEvent)=>{
      const input=event.target as HTMLInputElement|null
      if(!input||input.type!=='number')return
      window.setTimeout(()=>{
        try{input.select()}catch{}
      },0)
    }

    prepare()
    const observer=new MutationObserver(records=>{
      for(const record of records){
        for(const node of Array.from(record.addedNodes)){
          if(node instanceof HTMLElement)prepare(node)
        }
      }
    })
    observer.observe(document.body,{childList:true,subtree:true})
    document.addEventListener('focusin',handleFocus)

    return()=>{
      observer.disconnect()
      document.removeEventListener('focusin',handleFocus)
    }
  },[])
  const { profile, signOut } = useAuth()
  const role = profile?.role ?? 'staff'

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <img src="/logo-happylaundry.jpg" alt="HappyLaundry" />
          <div><strong>HappyLaundry</strong><span>Enterprise V112.8.2 Reprint Nota</span></div>
          <button className="icon-button mobile-only" onClick={() => setOpen(false)} aria-label="Tutup menu"><X size={20} /></button>
        </div>
        <nav>
          {items.filter(item => item.permission ? canAccess(profile,item.permission) : (item.roles?.includes(role)??false)).map(({ to, label, icon: Icon }) => (
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
          <div className="topbar-actions"><PWAInstallButton/><div className={`status-chip ${online?'':'offline'}`}>● {online?'Online':'Offline'}</div></div>
        </header>
        <div className="page-container"><Outlet /></div>
      </main>
    </div>
  )
}
