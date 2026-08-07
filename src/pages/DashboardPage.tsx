import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Banknote, CheckCircle2, PackageCheck, ShoppingBag, WashingMachine } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatIDR } from '../lib/format'
import { statusLabels } from '../lib/order'
import { supabase } from '../lib/supabase'
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
  const [orders,setOrders]=useState<OrderRow[]>([])
  const [cash,setCash]=useState<{amount:number;direction:'in'|'out';created_at:string}[]>([])
  const [orderItems,setOrderItems]=useState<DashboardOrderItem[]>([])
  const [services,setServices]=useState<DashboardService[]>([])
  const [message,setMessage]=useState('')
  const [revenuePeriod,setRevenuePeriod]=useState<'7d'|'month'|'3m'|'6m'|'12m'>('7d')

  const load=useCallback(async()=>{
    const start=new Date(); start.setHours(0,0,0,0)
    const [o,c,i,s]=await Promise.all([
      supabase.from('v100_orders_view').select('*').order('created_at',{ascending:false}),
      supabase.from('v100_cash_entries').select('amount,direction,created_at').gte('created_at',start.toISOString()),
      supabase.from('v100_order_items').select('order_id,service_id,subtotal'),
      supabase.from('v100_services').select('id,category')
    ])
    if(o.error||c.error||i.error||s.error)setMessage((o.error||c.error||i.error||s.error)?.message||'Gagal memuat data')
    else {
      setOrders((o.data as OrderRow[])||[])
      setCash(c.data||[])
      setOrderItems((i.data as DashboardOrderItem[])||[])
      setServices((s.data as DashboardService[])||[])
    }
  },[])

  useEffect(()=>{void load()},[load])

  const today=useMemo(()=>{const d=new Date();d.setHours(0,0,0,0);return orders.filter(r=>new Date(r.created_at)>=d)},[orders])
  const omzet=cash.reduce((s,r)=>s+(r.direction==='in'?Number(r.amount):0),0)
  const expense=cash.reduce((s,r)=>s+(r.direction==='out'?Number(r.amount):0),0)
  const processing=orders.filter(r=>['received','washing','drying','ironing','packing'].includes(r.status)).length
  const ready=orders.filter(r=>r.status==='ready').length
  const completed=today.filter(r=>r.status==='completed').length
  const receivable=orders.reduce((s,r)=>s+Math.max(0,Number(r.total)-Number(r.paid_amount)),0)

  const chart=useMemo(()=>{
    const now=new Date()

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

  const periodTitle=revenuePeriod==='7d'
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


  const revenueLinePoints=useMemo(()=>{
    const values=revenueSeries.map(item=>Number(item.value||0))
    const max=Math.max(...values,1)
    const width=720
    const height=220
    const padX=28
    const padY=26
    const innerW=width-padX*2
    const innerH=height-padY*2
    const points=values.map((value,index)=>{
      const x=padX+(values.length<=1?innerW/2:(index/(values.length-1))*innerW)
      const y=padY+innerH-(value/max)*innerH
      return{x,y,value,label:revenueSeries[index]?.label||''}
    })
    const line=points.map(p=>`${p.x},${p.y}`).join(' ')
    const area=points.length
      ? `${padX},${height-padY} ${line} ${padX+innerW},${height-padY}`
      : ''
    return{points,line,area,width,height,max}
  },[revenueSeries])


  return <>
    <PageHeader eyebrow="OWNER DASHBOARD" title="Ringkasan Operasional" description="Pantau omzet, order, proses cucian, dan piutang."/>
    {message&&<div className="error-box inline-message">{message}</div>}
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
    <section className="dashboard-grid">
      <article className="panel">
        <div className="panel-heading dashboard-revenue-heading">
          <div>
            <h3>{periodTitle}</h3>
            <p>{revenuePeriod==='month'?'Ringkasan omzet per minggu pada bulan berjalan.':'Berdasarkan pembayaran order.'}</p>
          </div>
          <div className="revenue-period-tabs">
            <button className={revenuePeriod==='7d'?'active':''} onClick={()=>setRevenuePeriod('7d')}>7 Hari</button>
            <button className={revenuePeriod==='month'?'active':''} onClick={()=>setRevenuePeriod('month')}>Bulan Ini</button>
            <button className={revenuePeriod==='3m'?'active':''} onClick={()=>setRevenuePeriod('3m')}>3 Bulan</button>
            <button className={revenuePeriod==='6m'?'active':''} onClick={()=>setRevenuePeriod('6m')}>6 Bulan</button>
            <button className={revenuePeriod==='12m'?'active':''} onClick={()=>setRevenuePeriod('12m')}>12 Bulan</button>
          </div>
        </div>
        <div className="revenue-line-chart">
        <svg viewBox={`0 0 ${revenueLinePoints.width} ${revenueLinePoints.height}`} role="img" aria-label="Grafik omzet">
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

          {revenueLinePoints.points.map((point,index)=><g key={index}>
            <circle cx={point.x} cy={point.y} r="7" className="revenue-point-halo"/>
            <circle cx={point.x} cy={point.y} r="4" className="revenue-point"/>
          </g>)}
        </svg>

        <div className="revenue-chart-labels">
          {revenueLinePoints.points.map((point,index)=><div key={index}>
            <b>{point.label}</b>
            <span>{formatIDR(point.value)}</span>
          </div>)}
        </div>
      </div>
    </section>
  </>
}
