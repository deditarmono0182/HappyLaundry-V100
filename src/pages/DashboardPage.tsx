import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Banknote, CheckCircle2, Crown, FileSpreadsheet, Landmark, MonitorCog, PackageCheck, ShieldAlert, ShoppingBag, Smartphone, TrendingUp, Users, WalletCards, WashingMachine } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatIDR } from '../lib/format'
import { statusLabels } from '../lib/order'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { downloadXls } from '../lib/exportData'
import type { OrderRow } from '../types/order'

interface DashboardOrderItem{
  order_id:string
  service_id:string|null
  subtotal:number
}

interface DashboardService{
  id:string
  category:string
}

export function DashboardPage() {
  const navigate=useNavigate()
  const {profile}=useAuth()
  const isOwner=profile?.role==='owner'
  const [orders,setOrders]=useState<OrderRow[]>([])
  const [cash,setCash]=useState<{amount:number;direction:'in'|'out';method?:string;created_at:string}[]>([])
  const [orderItems,setOrderItems]=useState<DashboardOrderItem[]>([])
  const [services,setServices]=useState<DashboardService[]>([])
  const [message,setMessage]=useState('')
  const [pendingDeletes,setPendingDeletes]=useState(0)
  const [revenuePeriod,setRevenuePeriod]=useState<'today'|'7d'|'month'|'3m'|'6m'|'12m'>('7d')
  const [density,setDensity]=useState<'comfort'|'compact'|'ultra'>(()=>
    (localStorage.getItem('happylaundry-density') as 'comfort'|'compact'|'ultra')||'compact'
  )

  const load=useCallback(async()=>{
    const start=new Date(); start.setHours(0,0,0,0)
    const [o,c,i,s]=await Promise.all([
      supabase.from('v100_orders_view').select('*').order('created_at',{ascending:false}),
      supabase.from('v100_cash_entries').select('amount,direction,method,created_at').order('created_at',{ascending:false}),
      supabase.from('v100_order_items').select('order_id,service_id,subtotal'),
      supabase.from('v100_services').select('id,category')
    ])
    if(o.error||c.error||i.error||s.error)setMessage((o.error||c.error||i.error||s.error)?.message||'Gagal memuat data')
    else {
      setOrders((o.data as OrderRow[])||[])
      setCash(c.data||[])
      setOrderItems((i.data as DashboardOrderItem[])||[])
      setServices((s.data as DashboardService[])||[])
      if(isOwner){
        const {count}=await supabase
          .from('v11306_delete_requests')
          .select('id',{count:'exact',head:true})
          .eq('status','pending')
        setPendingDeletes(count||0)
      }else{
        setPendingDeletes(0)
      }
    }
  },[isOwner])

  useEffect(()=>{void load()},[load])

  useEffect(()=>{
    document.documentElement.dataset.density=density
  },[density])

  const applyDensity=(value:'comfort'|'compact'|'ultra')=>{
    setDensity(value)
    localStorage.setItem('happylaundry-density',value)
    document.documentElement.dataset.density=value
  }

  const today=useMemo(()=>{const d=new Date();d.setHours(0,0,0,0);return orders.filter(r=>new Date(r.created_at)>=d)},[orders])
  const omzet=cash.reduce((s,r)=>s+(r.direction==='in'?Number(r.amount):0),0)
  const expense=cash.reduce((s,r)=>s+(r.direction==='out'?Number(r.amount):0),0)
  const processing=orders.filter(r=>['received','washing','drying','ironing','packing'].includes(r.status)).length
  const ready=orders.filter(r=>r.status==='ready').length
  const completed=today.filter(r=>r.status==='completed').length
  const receivable=orders.reduce((s,r)=>s+Math.max(0,Number(r.total)-Number(r.paid_amount)),0)

  const chart=useMemo(()=>{
    const now=new Date()

    if(revenuePeriod==='today'){
      const d=new Date(now);d.setHours(0,0,0,0);const n=new Date(d);n.setDate(n.getDate()+1)
      return [{label:'Hari Ini',total:orders.filter(r=>{const x=new Date(r.created_at);return x>=d&&x<n}).reduce((s,r)=>s+Number(r.paid_amount||0),0)}]
    }

    if(revenuePeriod==='7d'){
      return Array.from({length:7},(_,i)=>{
        const d=new Date(now); d.setDate(d.getDate()-(6-i)); d.setHours(0,0,0,0)
        const n=new Date(d); n.setDate(n.getDate()+1)
        return {
          label:d.toLocaleDateString('id-ID',{weekday:'short'}),
          total:orders
            .filter(r=>{const x=new Date(r.created_at);return x>=d&&x<n})
            .reduce((s,r)=>s+Number(r.paid_amount||0),0)
        }
      })
    }

    if(revenuePeriod==='month'){
      const year=now.getFullYear(),month=now.getMonth()
      return Array.from({length:5},(_,i)=>{
        const startDay=i*7+1
        const endDay=i===4?31:startDay+6
        const total=orders
          .filter(r=>{
            const x=new Date(r.created_at)
            return x.getFullYear()===year&&x.getMonth()===month&&x.getDate()>=startDay&&x.getDate()<=endDay
          })
          .reduce((s,r)=>s+Number(r.paid_amount||0),0)
        return {label:`M${i+1}`,total}
      })
    }

    const count=revenuePeriod==='3m'?3:revenuePeriod==='6m'?6:12
    return Array.from({length:count},(_,i)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-(count-1-i),1)
      const year=d.getFullYear(),month=d.getMonth()
      const total=orders
        .filter(r=>{
          const x=new Date(r.created_at)
          return x.getFullYear()===year&&x.getMonth()===month
        })
        .reduce((s,r)=>s+Number(r.paid_amount||0),0)
      return {label:d.toLocaleDateString('id-ID',{month:'short'}),total}
    })
  },[orders,revenuePeriod])

  const max=Math.max(1,...chart.map(x=>x.total))

  const revenueLinePoints=useMemo(()=>{
    const width=720
    const height=220
    const padX=28
    const padY=26
    const innerW=width-padX*2
    const innerH=height-padY*2
    const points=chart.map((item,index)=>{
      const x=padX+(chart.length<=1?innerW/2:(index/(chart.length-1))*innerW)
      const y=padY+innerH-(Number(item.total||0)/max)*innerH
      return{x,y,value:Number(item.total||0),label:item.label}
    })
    const line=points.map(point=>`${point.x},${point.y}`).join(' ')
    const area=points.length
      ? `${points[0].x},${height-padY} ${line} ${points[points.length-1].x},${height-padY}`
      : ''
    return{points,line,area,width,height}
  },[chart,max])

  const periodTitle=revenuePeriod==='today'
    ?'Omzet Hari Ini'
    :revenuePeriod==='7d'
    ?'Omzet 7 Hari'
    :revenuePeriod==='month'
      ?'Omzet Bulan Ini'
      :revenuePeriod==='3m'
        ?'Omzet 3 Bulan'
        :revenuePeriod==='6m'
          ?'Omzet 6 Bulan'
          :'Omzet 12 Bulan'

  const categoryRevenue=useMemo(()=>{
    const now=new Date()
    const periodStart=(()=>{
      if(revenuePeriod==='today'){const d=new Date(now);d.setHours(0,0,0,0);return d}
      if(revenuePeriod==='7d'){const d=new Date(now);d.setDate(d.getDate()-6);d.setHours(0,0,0,0);return d}
      if(revenuePeriod==='month')return new Date(now.getFullYear(),now.getMonth(),1)
      const count=revenuePeriod==='3m'?3:revenuePeriod==='6m'?6:12
      return new Date(now.getFullYear(),now.getMonth()-(count-1),1)
    })()

    const relevantOrders=orders.filter(o=>new Date(o.created_at)>=periodStart&&o.status!=='cancelled')
    const orderMap=new Map(relevantOrders.map(o=>[o.id,o]))
    const serviceCategory=new Map(services.map(s=>[s.id,s.category||'Reguler']))
    const grouped:Record<string,number>={}

    for(const item of orderItems){
      const order=orderMap.get(item.order_id)
      if(!order)continue
      const orderTotal=Math.max(0,Number(order.total||0))
      const paid=Math.max(0,Number(order.paid_amount||0))
      if(orderTotal<=0||paid<=0)continue

      // Omzet kategori mengikuti pembayaran aktual.
      // Jika order baru dibayar sebagian, subtotal item dialokasikan proporsional.
      const paidRatio=Math.min(1,paid/orderTotal)
      const category=item.service_id?serviceCategory.get(item.service_id)||'Reguler':'Reguler'
      grouped[category]=(grouped[category]||0)+(Number(item.subtotal||0)*paidRatio)
    }

    const total=Object.values(grouped).reduce((sum,v)=>sum+v,0)
    return Object.entries(grouped)
      .map(([category,amount])=>({category,amount,percentage:total>0?(amount/total)*100:0}))
      .sort((a,b)=>b.amount-a.amount)
  },[orders,orderItems,services,revenuePeriod])


  const ownerPeriodStart=useMemo(()=>{
    const now=new Date()
    if(revenuePeriod==='today'){now.setHours(0,0,0,0);return now}
    if(revenuePeriod==='7d'){now.setDate(now.getDate()-6);now.setHours(0,0,0,0);return now}
    if(revenuePeriod==='month')return new Date(now.getFullYear(),now.getMonth(),1)
    const count=revenuePeriod==='3m'?3:revenuePeriod==='6m'?6:12
    return new Date(now.getFullYear(),now.getMonth()-(count-1),1)
  },[revenuePeriod])

  const ownerPeriodOrders=useMemo(()=>orders.filter(r=>new Date(r.created_at)>=ownerPeriodStart&&r.status!=='cancelled'),[orders,ownerPeriodStart])
  const ownerPeriodCash=useMemo(()=>cash.filter(r=>new Date(r.created_at)>=ownerPeriodStart),[cash,ownerPeriodStart])
  const ownerIncome=ownerPeriodCash.filter(r=>r.direction==='in').reduce((s,r)=>s+Number(r.amount),0)
  const ownerExpense=ownerPeriodCash.filter(r=>r.direction==='out').reduce((s,r)=>s+Number(r.amount),0)
  const ownerProfit=ownerIncome-ownerExpense
  const ownerCash=ownerPeriodCash.filter(r=>r.direction==='in'&&r.method==='cash').reduce((s,r)=>s+Number(r.amount),0)
  const ownerQris=ownerPeriodCash.filter(r=>r.direction==='in'&&r.method==='qris').reduce((s,r)=>s+Number(r.amount),0)
  const ownerTransfer=ownerPeriodCash.filter(r=>r.direction==='in'&&r.method==='transfer').reduce((s,r)=>s+Number(r.amount),0)
  const ownerAverage=ownerPeriodOrders.length?ownerPeriodOrders.reduce((s,r)=>s+Number(r.total||0),0)/ownerPeriodOrders.length:0

  const exportOwnerReport=()=>{
    downloadXls({
      title:'Laporan Owner HappyLaundry',
      filename:`laporan-owner-${new Date().toISOString().slice(0,10)}`,
      subtitle:periodTitle,
      headers:['Indikator','Nilai'],
      rows:[
        ['Omzet / Kas Masuk',ownerIncome],
        ['Pengeluaran',ownerExpense],
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
      summary:[['Kas Masuk',ownerIncome],['Kas Keluar',ownerExpense],['Laba Bersih',ownerProfit]]
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
      <StatCard label="Omzet Hari Ini" value={formatIDR(omzet)} caption={`Pengeluaran ${formatIDR(expense)}`} icon={Banknote}/>
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
        <div><h3><TrendingUp size={18}/> Kontrol Bisnis Owner</h3><p>Ringkasan keuangan mengikuti periode grafik omzet yang dipilih.</p></div>
      </div>
      <div className="owner-business-kpis">
        <div><span>Kas Masuk</span><strong>{formatIDR(ownerIncome)}</strong></div>
        <div><span>Pengeluaran</span><strong>{formatIDR(ownerExpense)}</strong></div>
        <div className={ownerProfit>=0?'profit-positive':'profit-negative'}><span>Laba Bersih</span><strong>{formatIDR(ownerProfit)}</strong></div>
        <div><span>Piutang Aktif</span><strong>{formatIDR(receivable)}</strong></div>
      </div>
      <div className="owner-payment-breakdown">
        <div><Banknote size={18}/><span>Tunai</span><b>{formatIDR(ownerCash)}</b></div>
        <div><Smartphone size={18}/><span>QRIS</span><b>{formatIDR(ownerQris)}</b></div>
        <div><Landmark size={18}/><span>Transfer</span><b>{formatIDR(ownerTransfer)}</b></div>
        <div><ShoppingBag size={18}/><span>Order</span><b>{ownerPeriodOrders.length}</b></div>
        <div><WalletCards size={18}/><span>Rata-rata Order</span><b>{formatIDR(ownerAverage)}</b></div>
      </div>
    </section>}

    <section className="dashboard-grid">
      <article className="panel">
        <div className="panel-heading dashboard-revenue-heading">
          <div>
            <h3>{periodTitle}</h3>
            <p>{revenuePeriod==='month'?'Ringkasan omzet per minggu pada bulan berjalan.':'Berdasarkan pembayaran order.'}</p>
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
        <div className="revenue-line-chart">
          <svg viewBox={`0 0 ${revenueLinePoints.width} ${revenueLinePoints.height}`} role="img" aria-label={periodTitle}>
            <defs>
              <linearGradient id="revenueAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#42A5F5" stopOpacity=".34"/>
                <stop offset="100%" stopColor="#42A5F5" stopOpacity=".03"/>
              </linearGradient>
              <linearGradient id="revenueLineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#42A5F5"/>
                <stop offset="100%" stopColor="#1565C0"/>
              </linearGradient>
            </defs>

            {[0,1,2,3,4].map(level=>{
              const y=26+((revenueLinePoints.height-52)/4)*level
              return <line key={level} x1="28" x2={revenueLinePoints.width-28} y1={y} y2={y} className="revenue-grid-line"/>
            })}

            {revenueLinePoints.area&&<polygon points={revenueLinePoints.area} fill="url(#revenueAreaGradient)"/>}
            {revenueLinePoints.line&&<polyline points={revenueLinePoints.line} fill="none" stroke="url(#revenueLineGradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>}

            {revenueLinePoints.points.map((point,index)=><g key={`${point.label}-${index}`}>
              <circle cx={point.x} cy={point.y} r="7" className="revenue-point-halo"/>
              <circle cx={point.x} cy={point.y} r="4" className="revenue-point"/>
            </g>)}
          </svg>

          <div className="revenue-chart-labels">
            {revenueLinePoints.points.map((point,index)=><div key={`${point.label}-label-${index}`}>
              <b>{point.label}</b>
              <span>{formatIDR(point.value)}</span>
            </div>)}
          </div>
        </div>
      </article>
      <article className="panel">
        <div className="panel-heading"><div><h3>Status Order</h3><p>Order aktif saat ini.</p></div></div>
        <div className="status-summary">{(['received','washing','drying','ironing','packing','ready'] as const).map(s=><div key={s}><span className={`status-dot status-${s}`}/><span>{statusLabels[s]}</span><b>{orders.filter(r=>r.status===s).length}</b></div>)}</div>
      </article>
    </section>
    <section className="panel dashboard-category-revenue">
      <div className="panel-heading">
        <div>
          <h3>Omzet per Kategori Layanan</h3>
          <p>Jumlah rupiah dan persentase kontribusi berdasarkan periode grafik omzet di atas.</p>
        </div>
      </div>
      {categoryRevenue.length===0
        ? <div className="table-empty">Belum ada omzet kategori pada periode ini.</div>
        : <div className="category-revenue-list">
            {categoryRevenue.map((item,index)=><div className="category-revenue-row" key={item.category}>
              <span className="category-rank">{index+1}</span>
              <div className="category-revenue-name">
                <b>{item.category}</b>
                <div className="category-progress"><i style={{width:`${Math.max(2,item.percentage)}%`}}/></div>
              </div>
              <strong>{formatIDR(item.amount)}</strong>
              <span className="category-percent">{item.percentage.toFixed(1)}%</span>
            </div>)}
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
  </>
}
