import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, ShoppingBag, Users, WashingMachine, Package, Truck, WalletCards,
  CreditCard, Settings, LogOut, Menu, X, Sparkles, Calculator, BarChart3, DatabaseBackup, QrCode, CircleDollarSign, AlertTriangle, CalendarCheck2, ScanLine, Target, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { canAccess, type PermissionKey } from '../lib/permissions'
import { PWAInstallButton } from '../components/PWAInstallButton'
import { Modal } from '../components/Modal'
import { formatIDR } from '../lib/format'
import type { OrderRow } from '../types/order'
import { supabase } from '../lib/supabase'

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
  { to: '/daily-closing', label: 'Closing Harian', icon: CalendarCheck2, permission: 'cash' },
  { to: '/finance', label: 'Keuangan', icon: CircleDollarSign, permission: 'finance' },
  { to: '/profit-target', label: 'Laba & Target', icon: Target, roles: ['owner'] },
  { to: '/delete-approvals', label: 'Persetujuan Hapus', icon: ShieldAlert, roles: ['owner'] },
  { to: '/receivables', label: 'Piutang', icon: AlertTriangle, permission: 'receivables' },
  { to: '/reports', label: 'Laporan Owner', icon: BarChart3, permission: 'reports' },
  { to: '/attendance', label: 'Absen', icon: ScanLine, roles: ['employee'] },
  { to: '/payroll', label: 'Absensi & Gaji', icon: CalendarCheck2, roles: ['owner'] },
  { to: '/backup', label: 'Backup Data', icon: DatabaseBackup, permission: 'backup' },
  { to: '/settings', label: 'Pengaturan', icon: Settings, permission: 'settings' }
]

export function AppLayout() {
  const navigate=useNavigate()
  const [open,setOpen]=useState(false)
  const [online,setOnline]=useState(navigator.onLine)
  const [pendingDeletes,setPendingDeletes]=useState(0)
  const [showDeleteToast,setShowDeleteToast]=useState(false)
  const [attendanceGate,setAttendanceGate]=useState<{attendance_required:boolean;attended_today:boolean;checked_out:boolean;within_work_hours:boolean;logout_at:string|null;work_start:string;work_end:string}|null>(null)
  const [attendanceNotice,setAttendanceNotice]=useState('')
  const [problemOrders,setProblemOrders]=useState<OrderRow[]>([])
  const [problemAlertOpen,setProblemAlertOpen]=useState(false)
  const [problemAlertLoading,setProblemAlertLoading]=useState(false)

  const { profile, signOut } = useAuth()
  const role = profile?.role ?? 'staff'
  const isOwner=role==='owner'

  const problemSummary=useMemo(()=>{
    const now=Date.now()
    const overdue=problemOrders.filter(row=>Boolean(row.due_at)&&!['ready','completed','cancelled'].includes(row.status)&&new Date(row.due_at as string).getTime()<now)
    const unpaid=problemOrders.filter(row=>row.status!=='cancelled'&&Math.max(0,Number(row.total)-Number(row.paid_amount))>0)
    const ready=problemOrders.filter(row=>row.status==='ready')
    return{overdue,unpaid,ready}
  },[problemOrders])

  const problemReasons=(row:OrderRow)=>{
    const reasons:string[]=[]
    if(row.due_at&&!['ready','completed','cancelled'].includes(row.status)&&new Date(row.due_at).getTime()<Date.now())reasons.push('Terlambat')
    if(row.status==='ready')reasons.push('Siap diambil')
    if(row.status!=='cancelled'&&Math.max(0,Number(row.total)-Number(row.paid_amount))>0)reasons.push('Belum lunas')
    return reasons
  }

  const refreshPendingDeletes=useCallback(async(showToast=false)=>{
    if(!isOwner){
      setPendingDeletes(0)
      setShowDeleteToast(false)
      return
    }
    const {count,error}=await supabase
      .from('v11306_delete_requests')
      .select('id',{count:'exact',head:true})
      .eq('status','pending')
    if(error)return
    const next=count||0
    setPendingDeletes(previous=>{
      if(next>0&&(showToast||next>previous))setShowDeleteToast(true)
      return next
    })
  },[isOwner])

  useEffect(()=>{
    if(!isOwner)return
    void refreshPendingDeletes(true)

    const timer=window.setInterval(()=>{void refreshPendingDeletes(false)},30000)
    const channel=supabase
      .channel('owner-delete-approval-notification')
      .on(
        'postgres_changes',
        {event:'*',schema:'public',table:'v11306_delete_requests'},
        ()=>{void refreshPendingDeletes(false)}
      )
      .subscribe()

    const onFocus=()=>{void refreshPendingDeletes(false)}
    const onDeleteChanged=()=>{void refreshPendingDeletes(false)}
    window.addEventListener('focus',onFocus)
    window.addEventListener('happylaundry-delete-requests-changed',onDeleteChanged)

    return()=>{
      window.clearInterval(timer)
      window.removeEventListener('focus',onFocus)
      window.removeEventListener('happylaundry-delete-requests-changed',onDeleteChanged)
      void supabase.removeChannel(channel)
    }
  },[isOwner,refreshPendingDeletes])

  useEffect(()=>{
    if(!profile?.id)return
    let active=true

    const checkDailyProblemOrders=async()=>{
      const today=new Date().toLocaleDateString('en-CA')
      const reminderKey=`happylaundry-order-problem-reminder:${profile.id}:${today}`
      if(localStorage.getItem(reminderKey)==='shown')return

      setProblemAlertLoading(true)
      const{data,error}=await supabase
        .from('v100_orders_view')
        .select('*')
        .neq('status','cancelled')
        .order('created_at',{ascending:false})
      if(!active){setProblemAlertLoading(false);return}
      if(error){setProblemAlertLoading(false);return}

      const now=Date.now()
      const rows=((data as OrderRow[])||[]).filter(row=>{
        const overdue=Boolean(row.due_at)&&!['ready','completed','cancelled'].includes(row.status)&&new Date(row.due_at as string).getTime()<now
        const unpaid=row.status!=='cancelled'&&Math.max(0,Number(row.total)-Number(row.paid_amount))>0
        const ready=row.status==='ready'
        return overdue||unpaid||ready
      })

      setProblemOrders(rows)
      setProblemAlertLoading(false)
      if(rows.length>0){
        localStorage.setItem(reminderKey,'shown')
        setProblemAlertOpen(true)
      }
    }

    const timer=window.setTimeout(()=>{void checkDailyProblemOrders()},500)
    return()=>{active=false;window.clearTimeout(timer)}
  },[profile?.id])

  useEffect(()=>{
    const yes=()=>setOnline(true)
    const no=()=>setOnline(false)
    window.addEventListener('online',yes);window.addEventListener('offline',no)
    return()=>{window.removeEventListener('online',yes);window.removeEventListener('offline',no)}
  },[])

  useEffect(()=>{
    if(role!=='employee'){
      setAttendanceGate(null)
      setAttendanceNotice('')
      return
    }
    let active=true
    let timer:number|undefined

    const checkAttendance=async()=>{
      const{data,error}=await supabase.rpc('v11322_current_attendance_state')
      if(!active||error||!data)return
      const state=(Array.isArray(data)?data[0]:data) as typeof attendanceGate
      if(!state)return
      setAttendanceGate(state)

      if(state.attendance_required&&!state.attended_today){
        setAttendanceNotice(state.within_work_hours
          ?'Anda belum Absen Masuk hari ini. Scan QR + GPS untuk membuka akses kerja.'
          :`Akses kerja belum aktif. Jam kerja ${state.work_start}–${state.work_end}.`)
        if(window.location.pathname!=='/attendance')navigate('/attendance',{replace:true})
      }else if(state.attendance_required&&state.checked_out){
        setAttendanceNotice('Absen Pulang sudah tercatat. Sesi kerja hari ini telah selesai.')
        if(window.location.pathname!=='/attendance')navigate('/attendance',{replace:true})
      }else{
        setAttendanceNotice('')
      }

      if(state.attendance_required&&state.logout_at){
        const logoutAt=new Date(state.logout_at).getTime()
        if(Date.now()>=logoutAt){
          await signOut()
          navigate('/login',{replace:true})
        }
      }
    }

    void checkAttendance()
    timer=window.setInterval(()=>{void checkAttendance()},30000)
    const changed=()=>{void checkAttendance()}
    window.addEventListener('focus',changed)
    window.addEventListener('happylaundry-attendance-changed',changed)
    return()=>{
      active=false
      if(timer)window.clearInterval(timer)
      window.removeEventListener('focus',changed)
      window.removeEventListener('happylaundry-attendance-changed',changed)
    }
  },[role,navigate,signOut])

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
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <img src="/logo-happylaundry.jpg" alt="HappyLaundry" />
          <div><strong>HappyLaundry</strong><span>Enterprise V113.0.46 Daily Order Alert</span></div>
          <button className="icon-button mobile-only" onClick={() => setOpen(false)} aria-label="Tutup menu"><X size={20} /></button>
        </div>
        <nav>
          {items.filter(item => {
            const allowed=item.permission ? canAccess(profile,item.permission) : (item.roles?.includes(role)??false)
            if(!allowed)return false
            if(role==='employee'&&attendanceGate?.attendance_required&&(!attendanceGate.attended_today||attendanceGate.checked_out))return item.to==='/attendance'
            return true
          }).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)}>
              <Icon size={19}/>
              <span>{label}</span>
              {to==='/delete-approvals'&&pendingDeletes>0&&
                <b className="delete-approval-nav-badge" aria-label={`${pendingDeletes} permintaan hapus menunggu`}>
                  {pendingDeletes>99?'99+':pendingDeletes}
                </b>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="account"><b>{profile?.full_name || 'Pengguna'}</b><span>{role.toUpperCase()}</span></div>
          <button className="signout-button" onClick={() => signOut()}><LogOut size={18} />Keluar</button>
        </div>
      </aside>
      {open && <button className="overlay" onClick={() => setOpen(false)} aria-label="Tutup menu" />}

      {isOwner&&showDeleteToast&&pendingDeletes>0&&
        <div className="delete-approval-toast" role="status">
          <div className="delete-approval-toast-icon"><ShieldAlert size={20}/></div>
          <div>
            <b>{pendingDeletes} permintaan hapus menunggu</b>
            <span>Ada Order/Pengeluaran yang perlu persetujuan Owner.</span>
          </div>
          <button type="button" className="delete-toast-open" onClick={()=>{
            setShowDeleteToast(false)
            navigate('/delete-approvals')
          }}>Lihat</button>
          <button type="button" className="delete-toast-close" aria-label="Tutup notifikasi" onClick={()=>setShowDeleteToast(false)}><X size={15}/></button>
        </div>}

      {problemAlertOpen&&
        <Modal title="⚠ Peringatan Order Hari Ini" onClose={()=>setProblemAlertOpen(false)}>
          <div className="daily-order-alert">
            <div className="daily-order-alert-summary">
              <div className={problemSummary.overdue.length?'danger':''}><span>Terlambat</span><b>{problemSummary.overdue.length}</b></div>
              <div className={problemSummary.unpaid.length?'warning':''}><span>Belum Lunas / DP</span><b>{problemSummary.unpaid.length}</b></div>
              <div className={problemSummary.ready.length?'info':''}><span>Siap Diambil</span><b>{problemSummary.ready.length}</b></div>
            </div>
            <p className="daily-order-alert-note">Peringatan ini muncul otomatis satu kali setiap hari ketika akun masuk ke aplikasi, baik Owner maupun Karyawan.</p>
            {problemAlertLoading?<div className="daily-order-alert-empty">Memeriksa order...</div>:
              <div className="daily-order-alert-list">
                {problemOrders.slice(0,12).map(row=>{
                  const outstanding=Math.max(0,Number(row.total)-Number(row.paid_amount))
                  const reasons=problemReasons(row)
                  return <article key={row.id}>
                    <div>
                      <b>{row.order_no}</b>
                      <span>{row.customer_name}</span>
                      <small>{reasons.join(' • ')}</small>
                    </div>
                    <div>
                      {outstanding>0&&<b>{formatIDR(outstanding)}</b>}
                      <small>{row.due_at?`Estimasi ${new Date(row.due_at).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}`:'Tanpa estimasi'}</small>
                    </div>
                  </article>
                })}
                {problemOrders.length>12&&<div className="daily-order-alert-more">+ {problemOrders.length-12} order lainnya perlu dicek.</div>}
              </div>}
            <div className="daily-order-alert-actions">
              <button type="button" className="secondary-button" onClick={()=>setProblemAlertOpen(false)}>Nanti</button>
              <button type="button" className="primary-button" onClick={()=>{setProblemAlertOpen(false);navigate('/orders')}}>Buka Daftar Order</button>
            </div>
          </div>
        </Modal>}

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setOpen(true)} aria-label="Buka menu"><Menu size={22} /></button>
          <div><span className="eyebrow">HAPPYLAUNDRY BABAKAN</span><h1>Sistem Operasional Laundry</h1></div>
          <div className="topbar-actions"><PWAInstallButton/><div className={`status-chip ${online?'':'offline'}`}>● {online?'Online':'Offline'}</div></div>
        </header>
        <div className="page-container">
          {role==='employee'&&attendanceNotice&&<div className="attendance-access-notice">{attendanceNotice}</div>}
          <Outlet />
        </div>
      </main>
    </div>
  )
}
