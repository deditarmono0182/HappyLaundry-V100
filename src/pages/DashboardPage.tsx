import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Banknote, CheckCircle2, Crown, FileSpreadsheet, Landmark, MonitorCog, PackageCheck, ShieldAlert, ShoppingBag, Smartphone, TrendingUp, Users, WalletCards, WashingMachine } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { StatCard } from '../components/StatCard'
import { formatIDR } from '../lib/format'
import { statusLabels } from '../lib/order'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { downloadXls } from '../lib/exportData'
import type { OrderRow } from '../types/order'
import { addBusinessDays, businessDateKey, businessDateLabel, businessMonthKey, businessParts, businessPeriodStart } from '../lib/businessTime'

interface DashboardOrderItem{
  order_id:string
  service_id:string|null
  service_name:string
  unit:string
  quantity:number
  subtotal:number
}

interface DashboardService{
  id:string
  category:string
}

interface DashboardCommission{
  commission_type:string
  amount:number
  earned_at:string
}

interface DashboardProgressEvent{
  order_id:string
  new_status:string
  created_at:string
}

export function DashboardPage() {
  const navigate=useNavigate()
  const {profile}=useAuth()
  const isOwner=profile?.role==='owner'
  const [orders,setOrders]=useState<OrderRow[]>([])
  const [cash,setCash]=useState<{amount:number;direction:'in'|'out';created_at:string}[]>([])
  const [payments,setPayments]=useState<{amount:number;method:'cash'|'qris'|'transfer'|'other';created_at:string}[]>([])
  const [orderItems,setOrderItems]=useState<DashboardOrderItem[]>([])
  const [services,setServices]=useState<DashboardService[]>([])
  const [commissions,setCommissions]=useState<DashboardCommission[]>([])
  const [progressEvents,setProgressEvents]=useState<DashboardProgressEvent[]>([])
  const [message,setMessage]=useState('')
  const [pendingDeletes,setPendingDeletes]=useState(0)
  const [revenuePeriod,setRevenuePeriod]=useState<'today'|'7d'|'month'|'3m'|'6m'|'12m'>('7d')
  const [selectedCategory,setSelectedCategory]=useState<string|null>(null)
  const [businessClock,setBusinessClock]=useState(()=>Date.now())
  const [density,setDensity]=useState<'comfort'|'compact'|'ultra'>(()=>
    (localStorage.getItem('happylaundry-density') as 'comfort'|'compact'|'ultra')||'compact'
  )

  const load=useCallback(async()=>{
    const [o,c,pay,i,s,commissionRes]=await Promise.all([
      supabase.from('v100_orders_view').select('*').order('created_at',{ascending:false}),
      supabase.from('v100_cash_entries').select('amount,direction,created_at').order('created_at',{ascending:false}),
      supabase.from('v100_payments').select('amount,method,created_at').order('created_at',{ascending:false}),
      supabase.from('v100_order_items').select('order_id,service_id,service_name,unit,quantity,subtotal'),
      supabase.from('v100_services').select('id,category'),
      supabase.from('v113_commission_ledger').select('commission_type,amount,earned_at')
    ])
    if(o.error||c.error||pay.error||i.error||s.error||commissionRes.error)setMessage((o.error||c.error||pay.error||i.error||s.error||commissionRes.error)?.message||'Gagal memuat data')
    else {
      setOrders((o.data as OrderRow[])||[])
      setCash(c.data||[])
      setPayments((pay.data as {amount:number;method:'cash'|'qris'|'transfer'|'other';created_at:string}[])||[])
      setOrderItems((i.data as DashboardOrderItem[])||[])
      setServices((s.data as DashboardService[])||[])
      setCommissions((commissionRes.data as DashboardCommission[])||[])
      if(isOwner){
        const [{count},historyRes]=await Promise.all([
          supabase
            .from('v11306_delete_requests')
            .select('id',{count:'exact',head:true})
            .eq('status','pending'),
          supabase
            .from('v113063_order_progress_history')
            .select('order_id,new_status,created_at')
            .eq('new_status','completed')
            .order('created_at',{ascending:false})
        ])
        setPendingDeletes(count||0)
        setProgressEvents((historyRes.data as DashboardProgressEvent[])||[])
      }else{
        setPendingDeletes(0)
        setProgressEvents([])
      }
    }
  },[isOwner])

  useEffect(()=>{void load()},[load])

  useEffect(()=>{
    const tick=()=>setBusinessClock(Date.now())
    const timer=window.setInterval(tick,60000)
    const onFocus=()=>tick()
    window.addEventListener('focus',onFocus)
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',onFocus)}
  },[])

  useEffect(()=>{
    document.documentElement.dataset.density=density
  },[density])

  const applyDensity=(value:'comfort'|'compact'|'ultra')=>{
    setDensity(value)
    localStorage.setItem('happylaundry-density',value)
    document.documentElement.dataset.density=value
  }

  const businessToday=businessDateKey(businessClock)
  const today=useMemo(()=>orders.filter(r=>businessDateKey(r.created_at)===businessToday),[orders,businessToday])
  const todayCash=useMemo(()=>cash.filter(r=>businessDateKey(r.created_at)===businessToday),[cash,businessToday])
  const todayPayments=useMemo(()=>payments.filter(r=>businessDateKey(r.created_at)===businessToday),[payments,businessToday])
  const todayCommissions=useMemo(()=>commissions.filter(r=>businessDateKey(r.earned_at)===businessToday),[commissions,businessToday])
  const omzet=today.reduce((s,r)=>s+Number(r.total||0),0)
  const cashIn=todayPayments.reduce((s,r)=>s+Number(r.amount||0),0)
  const expense=todayCash.reduce((s,r)=>s+(r.direction==='out'?Number(r.amount):0),0)
  const todayCommission=todayCommissions.reduce((s,r)=>s+Number(r.amount||0),0)
  const processing=orders.filter(r=>['received','washing','drying','ironing','packing'].includes(r.status)).length
  const ready=orders.filter(r=>r.status==='ready').length
  const completed=today.filter(r=>r.status==='completed').length
  const receivable=orders.reduce((s,r)=>s+Math.max(0,Number(r.total)-Number(r.paid_amount)),0)
  const selectedPeriodStart=useMemo(()=>businessPeriodStart(revenuePeriod,new Date(businessClock)),[revenuePeriod,businessClock])
  const selectedPeriodCompleted=useMemo(()=>{
    const completedIds=new Set(progressEvents
      .filter(event=>new Date(event.created_at)>=selectedPeriodStart)
      .map(event=>event.order_id))

    // Fallback untuk order selesai lama yang dibuat sebelum riwayat progres tersedia.
    for(const order of orders){
      if(order.status!=='completed'||completedIds.has(order.id))continue
      const completedAt=order.progress_last_at||order.created_at
      if(new Date(completedAt)>=selectedPeriodStart)completedIds.add(order.id)
    }
    return completedIds.size
  },[progressEvents,orders,selectedPeriodStart])

  const selectedPeriodLabel=revenuePeriod==='today'?'Hari Ini'
    :revenuePeriod==='7d'?'7 Hari'
    :revenuePeriod==='month'?'Bulan Ini'
    :revenuePeriod==='3m'?'3 Bulan'
    :revenuePeriod==='6m'?'6 Bulan'
    :'12 Bulan'

  const chart=useMemo(()=>{
    const now=new Date(businessClock)
    const todayKey=businessDateKey(now)

    type Bucket={label:string;match:(value:string)=>boolean}
    let buckets:Bucket[]=[]

    if(revenuePeriod==='today'){
      buckets=[{label:'Hari Ini',match:value=>businessDateKey(value)===todayKey}]
    }else if(revenuePeriod==='7d'){
      buckets=Array.from({length:7},(_,i)=>{
        const key=addBusinessDays(todayKey,-(6-i))
        return {label:businessDateLabel(`${key}T12:00:00+07:00`,{weekday:'short'}),match:(value:string)=>businessDateKey(value)===key}
      })
    }else if(revenuePeriod==='month'){
      const currentMonth=businessMonthKey(now)
      buckets=Array.from({length:5},(_,i)=>{
        const startDay=i*7+1
        const endDay=i===4?31:startDay+6
        return {
          label:`M${i+1}`,
          match:(value:string)=>{
            if(businessMonthKey(value)!==currentMonth)return false
            const day=businessParts(value).day
            return day>=startDay&&day<=endDay
          }
        }
      })
    }else{
      const count=revenuePeriod==='3m'?3:revenuePeriod==='6m'?6:12
      const current=businessParts(now)
      buckets=Array.from({length:count},(_,i)=>{
        const anchor=new Date(Date.UTC(current.year,current.month-1-(count-1-i),1,12,0,0))
        const y=anchor.getUTCFullYear(),m=anchor.getUTCMonth()+1
        const key=`${y}-${String(m).padStart(2,'0')}`
        return {label:new Intl.DateTimeFormat('id-ID',{month:'short',timeZone:'UTC'}).format(anchor),match:(value:string)=>businessMonthKey(value)===key}
      })
    }

    return buckets.map(bucket=>{
      const bucketOrders=orders.filter(r=>r.status!=='cancelled'&&bucket.match(r.created_at))
      const orderValue=bucketOrders.reduce((sum,r)=>sum+Number(r.total||0),0)
      const cashIn=payments.filter(r=>bucket.match(r.created_at)).reduce((sum,r)=>sum+Number(r.amount||0),0)
      const expense=cash.filter(r=>r.direction==='out'&&bucket.match(r.created_at)).reduce((sum,r)=>sum+Number(r.amount||0),0)
      const commission=commissions.filter(r=>bucket.match(r.earned_at)).reduce((sum,r)=>sum+Number(r.amount||0),0)
      return {
        label:bucket.label,
        omzet:orderValue,
        cashIn,
        net:orderValue-expense-commission,
        orders:bucketOrders.length
      }
    })
  },[orders,payments,cash,commissions,revenuePeriod,businessClock])

  const maxMoney=Math.max(1,...chart.flatMap(x=>[x.omzet,x.cashIn,Math.max(0,x.net)]))
  const maxOrders=Math.max(1,...chart.map(x=>x.orders))

  const combinedChart=useMemo(()=>{
    const width=760
    const height=250
    const padX=36
    const padY=30
    const innerW=width-padX*2
    const innerH=height-padY*2
    const groupW=innerW/Math.max(1,chart.length)
    const barW=Math.max(8,Math.min(18,groupW/5))
    const moneyY=(value:number)=>padY+innerH-(Math.max(0,value)/maxMoney)*innerH
    const orderPoints=chart.map((item,index)=>({
      x:padX+groupW*(index+.5),
      y:padY+innerH-(item.orders/maxOrders)*innerH,
      value:item.orders,
      label:item.label
    }))
    return{width,height,padX,padY,innerH,groupW,barW,moneyY,orderPoints,orderLine:orderPoints.map(p=>`${p.x},${p.y}`).join(' ')}
  },[chart,maxMoney,maxOrders])

  const periodTitle=revenuePeriod==='today'
    ?'Omzet / Barang Masuk Hari Ini'
    :revenuePeriod==='7d'
    ?'Omzet / Barang Masuk 7 Hari'
    :revenuePeriod==='month'
      ?'Omzet / Barang Masuk Bulan Ini'
      :revenuePeriod==='3m'
        ?'Omzet / Barang Masuk 3 Bulan'
        :revenuePeriod==='6m'
          ?'Omzet / Barang Masuk 6 Bulan'
          :'Omzet / Barang Masuk 12 Bulan'

  const categoryRevenue=useMemo(()=>{
    const periodStart=businessPeriodStart(revenuePeriod,new Date(businessClock))

    const relevantOrders=orders.filter(o=>new Date(o.created_at)>=periodStart&&o.status!=='cancelled')
    const orderMap=new Map(relevantOrders.map(o=>[o.id,o]))
    const serviceCategory=new Map(services.map(s=>[s.id,s.category||'Reguler']))
    const grouped:Record<string,number>={}

    for(const item of orderItems){
      const order=orderMap.get(item.order_id)
      if(!order)continue
      const orderSubtotal=Math.max(0,Number(order.subtotal||0))
      const orderTotal=Math.max(0,Number(order.total||0))
      if(orderTotal<=0)continue

      // V113.0.70: kategori mengikuti NILAI BARANG MASUK, bukan hanya pembayaran.
      // Diskon order dialokasikan proporsional agar total kategori tetap sama dengan nilai order bersih.
      const discountRatio=orderSubtotal>0?Math.min(1,orderTotal/orderSubtotal):1
      const category=item.service_id?serviceCategory.get(item.service_id)||'Reguler':'Reguler'
      grouped[category]=(grouped[category]||0)+(Number(item.subtotal||0)*discountRatio)
    }

    const total=Object.values(grouped).reduce((sum,v)=>sum+v,0)
    return Object.entries(grouped)
      .map(([category,amount])=>({category,amount,percentage:total>0?(amount/total)*100:0}))
      .sort((a,b)=>b.amount-a.amount)
  },[orders,orderItems,services,revenuePeriod,businessClock])

  const categoryDetails=useMemo(()=>{
    if(!selectedCategory)return []
    const periodStart=businessPeriodStart(revenuePeriod,new Date(businessClock))
    const relevantOrders=orders.filter(o=>new Date(o.created_at)>=periodStart&&o.status!=='cancelled')
    const orderMap=new Map(relevantOrders.map(o=>[o.id,o]))
    const serviceCategory=new Map(services.map(s=>[s.id,s.category||'Reguler']))

    return orderItems.flatMap(item=>{
      const order=orderMap.get(item.order_id)
      if(!order)return []
      const category=item.service_id?serviceCategory.get(item.service_id)||'Reguler':'Reguler'
      if(category!==selectedCategory)return []
      const orderSubtotal=Math.max(0,Number(order.subtotal||0))
      const orderTotal=Math.max(0,Number(order.total||0))
      const discountRatio=orderSubtotal>0?Math.min(1,orderTotal/orderSubtotal):1
      return [{
        orderNo:order.order_no,
        customer:order.customer_name,
        phone:order.customer_phone,
        service:item.service_name||selectedCategory,
        unit:item.unit||'',
        quantity:Number(item.quantity||0),
        amount:Number(item.subtotal||0)*discountRatio,
        date:order.created_at
      }]
    }).sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime())
  },[selectedCategory,orders,orderItems,services,revenuePeriod,businessClock])

  const selectedCategorySummary=useMemo(()=>({
    total:categoryDetails.reduce((sum,row)=>sum+row.amount,0),
    ordersCount:new Set(categoryDetails.map(row=>row.orderNo)).size,
    items:categoryDetails.length
  }),[categoryDetails])


  const ownerPeriodStart=useMemo(()=>businessPeriodStart(revenuePeriod,new Date(businessClock)),[revenuePeriod,businessClock])

  const ownerPeriodOrders=useMemo(()=>orders.filter(r=>new Date(r.created_at)>=ownerPeriodStart&&r.status!=='cancelled'),[orders,ownerPeriodStart])
  const ownerPeriodCash=useMemo(()=>cash.filter(r=>new Date(r.created_at)>=ownerPeriodStart),[cash,ownerPeriodStart])
  const ownerExpense=ownerPeriodCash.filter(r=>r.direction==='out').reduce((s,r)=>s+Number(r.amount),0)
  const ownerPeriodPayments=useMemo(()=>payments.filter(r=>new Date(r.created_at)>=ownerPeriodStart),[payments,ownerPeriodStart])
  const ownerCashIn=ownerPeriodPayments.reduce((s,r)=>s+Number(r.amount||0),0)
  const ownerOrderValue=ownerPeriodOrders.reduce((s,r)=>s+Number(r.total||0),0)
  const ownerPeriodCommissions=useMemo(()=>commissions.filter(r=>new Date(r.earned_at)>=ownerPeriodStart),[commissions,ownerPeriodStart])
  const ownerProductionCommission=ownerPeriodCommissions.filter(r=>r.commission_type==='production').reduce((s,r)=>s+Number(r.amount||0),0)
  const ownerCourierCommission=ownerPeriodCommissions.filter(r=>r.commission_type==='courier').reduce((s,r)=>s+Number(r.amount||0),0)
  const ownerCommission=ownerProductionCommission+ownerCourierCommission
  const ownerProfit=ownerOrderValue-ownerExpense-ownerCommission
  const ownerCash=ownerPeriodPayments.filter(r=>r.method==='cash').reduce((s,r)=>s+Number(r.amount),0)
  const ownerQris=ownerPeriodPayments.filter(r=>r.method==='qris').reduce((s,r)=>s+Number(r.amount),0)
  const ownerTransfer=ownerPeriodPayments.filter(r=>r.method==='transfer').reduce((s,r)=>s+Number(r.amount),0)
  const ownerAverage=ownerPeriodOrders.length?ownerPeriodOrders.reduce((s,r)=>s+Number(r.total||0),0)/ownerPeriodOrders.length:0

  const exportOwnerReport=()=>{
    downloadXls({
      title:'Laporan Owner HappyLaundry',
      filename:`laporan-owner-${businessDateKey()}`,
      subtitle:periodTitle,
      headers:['Indikator','Nilai'],
      rows:[
        ['Omzet / Nilai Barang Masuk',ownerOrderValue],
        ['Kas Masuk (Terbayar)',ownerCashIn],
        ['Pengeluaran',ownerExpense],
        ['Komisi Produksi',ownerProductionCommission],
        ['Komisi Kurir',ownerCourierCommission],
        ['Laba Bersih',ownerProfit],
        ['Piutang Aktif',receivable],
        ['Tunai',ownerCash],
        ['QRIS',ownerQris],
        ['Transfer',ownerTransfer],
        ['Jumlah Order',ownerPeriodOrders.length],
        ['Rata-rata Nilai Order',ownerAverage],
        ['Sedang Diproses',processing],
        ['Siap Diambil',ready]
      ],
      summary:[['Omzet Barang Masuk',ownerOrderValue],['Kas Masuk',ownerCashIn],['Pengeluaran',ownerExpense],['Komisi',ownerCommission],['Laba Bersih',ownerProfit]]
    })
  }


  const topCustomers=useMemo(()=>{
    const grouped=new Map<string,{
      name:string
      phone:string
      count:number
      total:number
      paid:number
      lastOrder:string
    }>()

    for(const order of orders){
      if(order.status==='cancelled')continue
      const key=(order.customer_phone||order.customer_name||order.id).trim().toLowerCase()
      const current=grouped.get(key)||{
        name:order.customer_name||'Pelanggan',
        phone:order.customer_phone||'',
        count:0,
        total:0,
        paid:0,
        lastOrder:order.created_at
      }

      current.count+=1
      current.total+=Number(order.total||0)
      current.paid+=Number(order.paid_amount||0)
      if(new Date(order.created_at)>new Date(current.lastOrder)){
        current.lastOrder=order.created_at
      }

      grouped.set(key,current)
    }

    return Array.from(grouped.values())
      .sort((a,b)=>b.count-a.count||b.total-a.total)
      .slice(0,5)
  },[orders])


  return <>
    <PageHeader eyebrow="OWNER DASHBOARD" title="Ringkasan Operasional" description="Pantau omzet, keuangan, pembayaran, order, proses cucian, dan piutang." hideBack
      action={isOwner?<button type="button" className="secondary-button" onClick={exportOwnerReport}><FileSpreadsheet size={18}/> Export Laporan Owner</button>:undefined}
    />
    {message&&<div className="error-box inline-message">{message}</div>}

    {isOwner&&pendingDeletes>0&&
      <button type="button" className="dashboard-delete-approval-alert" onClick={()=>navigate('/delete-approvals')}>
        <span className="dashboard-delete-alert-icon"><ShieldAlert size={22}/></span>
        <span className="dashboard-delete-alert-copy">
          <b>Ada {pendingDeletes} permintaan hapus menunggu persetujuan</b>
          <small>Order atau Pengeluaran belum terhapus. Klik untuk periksa dan Setujui/Tolak.</small>
        </span>
        <span className="dashboard-delete-alert-count">{pendingDeletes>99?'99+':pendingDeletes}</span>
        <span className="dashboard-delete-alert-action">Periksa →</span>
      </button>}

    <section className="panel dashboard-display-customizer">
      <div className="dashboard-display-title">
        <div className="dashboard-display-icon"><MonitorCog size={20}/></div>
        <div>
          <b>Tampilan Aplikasi</b>
          <small>Setiap karyawan dapat memilih ukuran tampilan yang nyaman di perangkat ini.</small>
        </div>
      </div>
      <div className="dashboard-density-options">
        <button type="button" className={density==='comfort'?'active':''} onClick={()=>applyDensity('comfort')}>
          <b>Comfort</b><span>Besar & lega</span>
        </button>
        <button type="button" className={density==='compact'?'active':''} onClick={()=>applyDensity('compact')}>
          <b>Compact</b><span>Rekomendasi</span>
        </button>
        <button type="button" className={density==='ultra'?'active':''} onClick={()=>applyDensity('ultra')}>
          <b>Ultra Compact</b><span>Data lebih banyak</span>
        </button>
      </div>
      <small className="dashboard-display-device-note">Pengaturan tersimpan di perangkat/browser ini dan tidak mengubah tampilan pengguna lain.</small>
    </section>
    <section className="stats-grid dashboard-stats">
      <StatCard label="Omzet / Barang Masuk Hari Ini" value={formatIDR(omzet)} caption={`Kas masuk ${formatIDR(cashIn)}`} icon={Banknote}/>
      <StatCard label="Order Hari Ini" value={String(today.length)} caption="Order masuk hari ini" icon={ShoppingBag}/>
      <StatCard label="Sedang Diproses" value={String(processing)} caption="Belum siap diambil" icon={WashingMachine}/>
      <StatCard label="Siap Diambil" value={String(ready)} caption="Menunggu pelanggan" icon={PackageCheck}/>
      <StatCard label="Selesai Hari Ini" value={String(completed)} caption="Order selesai" icon={CheckCircle2}/>
      <button type="button" className="dashboard-click-stat" onClick={()=>navigate('/receivables')} title="Buka daftar piutang">
        <StatCard label="Total Piutang" value={formatIDR(receivable)} caption="Sisa tagihan • Klik untuk lihat" icon={AlertTriangle}/>
      </button>
    </section>
    {isOwner&&<section className="panel owner-business-report">
      <div className="panel-heading">
        <div><h3><TrendingUp size={18}/> Kontrol Bisnis Owner</h3><p>Omzet mengikuti nilai order/barang masuk. Kas masuk menunjukkan pembayaran yang sudah diterima.</p></div>
      </div>
      <div className="owner-business-kpis owner-business-kpis-six">
        <div><span>Omzet / Barang Masuk</span><strong>{formatIDR(ownerOrderValue)}</strong></div>
        <div><span>Kas Masuk</span><strong>{formatIDR(ownerCashIn)}</strong></div>
        <div><span>Pengeluaran</span><strong>{formatIDR(ownerExpense)}</strong></div>
        <div><span>Komisi</span><strong>{formatIDR(ownerCommission)}</strong></div>
        <div className={ownerProfit>=0?'profit-positive':'profit-negative'}><span>Laba Bersih</span><strong>{formatIDR(ownerProfit)}</strong></div>
        <div><span>Piutang Aktif</span><strong>{formatIDR(receivable)}</strong></div>
      </div>
      <div className="owner-payment-breakdown">
        <div><Banknote size={18}/><span>Tunai</span><b>{formatIDR(ownerCash)}</b></div>
        <div><Smartphone size={18}/><span>QRIS</span><b>{formatIDR(ownerQris)}</b></div>
        <div><Landmark size={18}/><span>Transfer</span><b>{formatIDR(ownerTransfer)}</b></div>
        <div><ShoppingBag size={18}/><span>Jumlah Order Masuk</span><b>{ownerPeriodOrders.length}</b></div>
        <div><WalletCards size={18}/><span>Rata-rata Order</span><b>{formatIDR(ownerAverage)}</b></div>
      </div>
    </section>}

    <section className="dashboard-grid">
      <article className="panel">
        <div className="panel-heading dashboard-revenue-heading">
          <div>
            <h3>{periodTitle}</h3>
            <p>Omzet/barang masuk, kas masuk, laba bersih, dan jumlah order pada periode yang sama.</p>
          </div>
          <div className="revenue-period-tabs">
            <button className={revenuePeriod==='today'?'active':''} onClick={()=>setRevenuePeriod('today')}>Hari Ini</button>
            <button className={revenuePeriod==='7d'?'active':''} onClick={()=>setRevenuePeriod('7d')}>7 Hari</button>
            <button className={revenuePeriod==='month'?'active':''} onClick={()=>setRevenuePeriod('month')}>Bulan Ini</button>
            <button className={revenuePeriod==='3m'?'active':''} onClick={()=>setRevenuePeriod('3m')}>3 Bulan</button>
            <button className={revenuePeriod==='6m'?'active':''} onClick={()=>setRevenuePeriod('6m')}>6 Bulan</button>
            <button className={revenuePeriod==='12m'?'active':''} onClick={()=>setRevenuePeriod('12m')}>12 Bulan</button>
          </div>
        </div>
        <div className="owner-combined-chart">
          <div className="owner-chart-legend">
            <span className="legend-order-value">Omzet / Barang Masuk</span>
            <span className="legend-cash-in">Kas Masuk</span>
            <span className="legend-net">Laba Bersih</span>
            <span className="legend-order-count">Jumlah Order</span>
          </div>
          <svg viewBox={`0 0 ${combinedChart.width} ${combinedChart.height}`} role="img" aria-label={periodTitle}>
            {[0,1,2,3,4].map(level=>{
              const y=combinedChart.padY+(combinedChart.innerH/4)*level
              return <line key={level} x1={combinedChart.padX} x2={combinedChart.width-combinedChart.padX} y1={y} y2={y} className="revenue-grid-line"/>
            })}
            {chart.map((item,index)=>{
              const center=combinedChart.padX+combinedChart.groupW*(index+.5)
              const values=[
                {value:item.omzet,x:center-combinedChart.barW*1.25,cls:'owner-bar-order-value'},
                {value:item.cashIn,x:center,cls:'owner-bar-cash-in'},
                {value:Math.max(0,item.net),x:center+combinedChart.barW*1.25,cls:'owner-bar-net'}
              ]
              return <g key={`${item.label}-${index}`}>
                {values.map((bar,barIndex)=>{
                  const y=combinedChart.moneyY(bar.value)
                  const h=combinedChart.padY+combinedChart.innerH-y
                  return <rect key={barIndex} x={bar.x-combinedChart.barW/2} y={y} width={combinedChart.barW} height={Math.max(2,h)} rx="4" className={bar.cls}/>
                })}
              </g>
            })}
            {combinedChart.orderLine&&<polyline points={combinedChart.orderLine} fill="none" className="owner-order-line"/>}
            {combinedChart.orderPoints.map((point,index)=><g key={`${point.label}-orders-${index}`}>
              <circle cx={point.x} cy={point.y} r="5" className="owner-order-point"/>
              <text x={point.x} y={Math.max(14,point.y-10)} textAnchor="middle" className="owner-order-count-text">{point.value}</text>
            </g>)}
          </svg>
          <div className="owner-chart-labels">
            {chart.map((item,index)=><div key={`${item.label}-summary-${index}`}>
              <b>{item.label}</b>
              <span>Barang {formatIDR(item.omzet)}</span>
              <span>Kas {formatIDR(item.cashIn)}</span>
              <span>Laba {formatIDR(item.net)}</span>
              <strong>{item.orders} order</strong>
            </div>)}
          </div>
        </div>
      </article>
      <article className="panel">
        <div className="panel-heading"><div><h3>Status Order</h3><p>Order aktif saat ini + selesai sesuai periode grafik.</p></div></div>
        <div className="status-summary">
          {(['received','washing','drying','ironing','packing','ready'] as const).map(s=><div key={s}><span className={`status-dot status-${s}`}/><span>{statusLabels[s]}</span><b>{orders.filter(r=>r.status===s).length}</b></div>)}
          <div><span className="status-dot status-completed"/><span>Selesai / Terkirim <small>({selectedPeriodLabel})</small></span><b>{selectedPeriodCompleted}</b></div>
        </div>
      </article>
    </section>
    <section className="panel dashboard-category-revenue">
      <div className="panel-heading">
        <div>
          <h3>Omzet / Barang Masuk per Kategori Layanan</h3>
          <p>Nilai barang masuk dan persentase kontribusi berdasarkan order pada periode grafik di atas.</p>
        </div>
      </div>
      {categoryRevenue.length===0
        ? <div className="table-empty">Belum ada omzet kategori pada periode ini.</div>
        : <div className="category-revenue-list">
            {categoryRevenue.map((item,index)=><button type="button" className="category-revenue-row category-revenue-button" key={item.category} onClick={()=>setSelectedCategory(item.category)} title={`Lihat detail ${item.category}`}>
              <span className="category-rank">{index+1}</span>
              <div className="category-revenue-name">
                <b>{item.category}</b>
                <small>Klik untuk lihat detail layanan & order</small>
                <div className="category-progress"><i style={{width:`${Math.max(2,item.percentage)}%`}}/></div>
              </div>
              <strong>{formatIDR(item.amount)}</strong>
              <span className="category-percent">{item.percentage.toFixed(1)}%</span>
            </button>)}
          </div>}
    </section>
    <section className="panel dashboard-top-customers">
      <div className="panel-heading dashboard-top-customers-heading">
        <div>
          <h3><Users size={18}/> Pelanggan dengan Transaksi Terbanyak</h3>
          <p>5 pelanggan paling aktif berdasarkan jumlah order. Order dibatalkan tidak dihitung.</p>
        </div>
        <button type="button" className="secondary-button" onClick={()=>navigate('/customers')}>Lihat Pelanggan</button>
      </div>

      {topCustomers.length===0
        ? <div className="table-empty">Belum ada transaksi pelanggan.</div>
        : <div className="top-customer-list">
            {topCustomers.map((customer,index)=><button
              type="button"
              className="top-customer-row"
              key={`${customer.phone}-${customer.name}-${index}`}
              onClick={()=>navigate(`/orders?customer=${encodeURIComponent(customer.phone||customer.name)}`)}
              title="Klik untuk lihat order pelanggan"
            >
              <span className={`top-customer-rank rank-${index+1}`}>
                {index===0?<Crown size={16}/>:index+1}
              </span>
              <div className="top-customer-info">
                <b>{customer.name}</b>
                <small>{customer.phone||'Tanpa nomor telepon'}</small>
              </div>
              <div className="top-customer-stat">
                <span>Transaksi</span>
                <strong>{customer.count}</strong>
              </div>
              <div className="top-customer-stat">
                <span>Total Belanja</span>
                <strong>{formatIDR(customer.total)}</strong>
              </div>
              <div className="top-customer-stat">
                <span>Terakhir</span>
                <strong>{new Date(customer.lastOrder).toLocaleDateString('id-ID')}</strong>
              </div>
            </button>)}
          </div>}
    </section>

    <section className="panel recent-orders">
      <div className="panel-heading"><div><h3>Order Terbaru</h3><p>10 transaksi terbaru.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Order</th><th>Pelanggan</th><th>Status</th><th>Total</th><th>Sisa</th><th>Dibuat</th></tr></thead>
      <tbody>{orders.slice(0,10).map(r=><tr key={r.id}><td><b>{r.order_no}</b></td><td><b>{r.customer_name}</b><small>{r.customer_phone}</small></td><td><span className={`badge status-${r.status}`}>{statusLabels[r.status]}</span></td><td>{formatIDR(r.total)}</td><td>{formatIDR(Math.max(0,Number(r.total)-Number(r.paid_amount)))}</td><td>{new Date(r.created_at).toLocaleString('id-ID')}</td></tr>)}
      {orders.length===0&&<tr><td colSpan={6} className="table-empty">Belum ada order.</td></tr>}</tbody></table></div>
    </section>
    {selectedCategory&&<Modal title={`Detail Kategori ${selectedCategory} — ${selectedPeriodLabel}`} onClose={()=>setSelectedCategory(null)} className="category-detail-modal" bodyClassName="category-detail-body">
      <div className="category-detail-summary">
        <div><span>Total Nilai</span><b>{formatIDR(selectedCategorySummary.total)}</b></div>
        <div><span>Order</span><b>{selectedCategorySummary.ordersCount}</b></div>
        <div><span>Item Layanan</span><b>{selectedCategorySummary.items}</b></div>
      </div>
      <div className="table-wrap category-detail-table">
        <table>
          <thead><tr><th>Tanggal</th><th>Order</th><th>Pelanggan</th><th>Layanan</th><th>Qty</th><th>Nilai</th></tr></thead>
          <tbody>
            {categoryDetails.length===0
              ? <tr><td colSpan={6} className="table-empty">Tidak ada detail pada periode ini.</td></tr>
              : categoryDetails.map((row,index)=><tr key={`${row.orderNo}-${row.service}-${index}`}>
                  <td>{businessDateLabel(row.date)}</td>
                  <td><b>{row.orderNo}</b></td>
                  <td><b>{row.customer}</b><small>{row.phone||'-'}</small></td>
                  <td>{row.service}</td>
                  <td>{row.quantity.toLocaleString('id-ID')} {row.unit}</td>
                  <td><b>{formatIDR(row.amount)}</b></td>
                </tr>)}
          </tbody>
        </table>
      </div>
      <div className="category-detail-actions"><button type="button" className="secondary-button" onClick={()=>setSelectedCategory(null)}>Tutup</button></div>
    </Modal>}
  </>
}
