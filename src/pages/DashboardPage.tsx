import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Banknote, CheckCircle2, PackageCheck, ShoppingBag, WashingMachine } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatIDR } from '../lib/format'
import { statusLabels } from '../lib/order'
import { supabase } from '../lib/supabase'
import type { OrderRow } from '../types/order'

export function DashboardPage() {
  const [orders,setOrders]=useState<OrderRow[]>([])
  const [cash,setCash]=useState<{amount:number;direction:'in'|'out';created_at:string}[]>([])
  const [message,setMessage]=useState('')

  const load=useCallback(async()=>{
    const start=new Date(); start.setHours(0,0,0,0)
    const [o,c]=await Promise.all([
      supabase.from('v100_orders_view').select('*').order('created_at',{ascending:false}),
      supabase.from('v100_cash_entries').select('amount,direction,created_at').gte('created_at',start.toISOString())
    ])
    if(o.error||c.error)setMessage((o.error||c.error)?.message||'Gagal memuat data')
    else { setOrders((o.data as OrderRow[])||[]); setCash(c.data||[]) }
  },[])

  useEffect(()=>{void load()},[load])

  const today=useMemo(()=>{const d=new Date();d.setHours(0,0,0,0);return orders.filter(r=>new Date(r.created_at)>=d)},[orders])
  const omzet=cash.reduce((s,r)=>s+(r.direction==='in'?Number(r.amount):0),0)
  const expense=cash.reduce((s,r)=>s+(r.direction==='out'?Number(r.amount):0),0)
  const processing=orders.filter(r=>['received','washing','drying','ironing','packing'].includes(r.status)).length
  const ready=orders.filter(r=>r.status==='ready').length
  const completed=today.filter(r=>r.status==='completed').length
  const receivable=orders.reduce((s,r)=>s+Math.max(0,Number(r.total)-Number(r.paid_amount)),0)

  const chart=useMemo(()=>Array.from({length:7},(_,i)=>{
    const d=new Date(); d.setDate(d.getDate()-(6-i)); d.setHours(0,0,0,0)
    const n=new Date(d); n.setDate(n.getDate()+1)
    return {label:d.toLocaleDateString('id-ID',{weekday:'short'}),total:orders.filter(r=>{const x=new Date(r.created_at);return x>=d&&x<n}).reduce((s,r)=>s+Number(r.paid_amount),0)}
  }),[orders])
  const max=Math.max(1,...chart.map(x=>x.total))

  return <>
    <PageHeader eyebrow="OWNER DASHBOARD" title="Ringkasan Operasional" description="Pantau omzet, order, proses cucian, dan piutang."/>
    {message&&<div className="error-box inline-message">{message}</div>}
    <section className="stats-grid dashboard-stats">
      <StatCard label="Omzet Hari Ini" value={formatIDR(omzet)} caption={`Pengeluaran ${formatIDR(expense)}`} icon={Banknote}/>
      <StatCard label="Order Hari Ini" value={String(today.length)} caption="Order masuk hari ini" icon={ShoppingBag}/>
      <StatCard label="Sedang Diproses" value={String(processing)} caption="Belum siap diambil" icon={WashingMachine}/>
      <StatCard label="Siap Diambil" value={String(ready)} caption="Menunggu pelanggan" icon={PackageCheck}/>
      <StatCard label="Selesai Hari Ini" value={String(completed)} caption="Order selesai" icon={CheckCircle2}/>
      <StatCard label="Total Piutang" value={formatIDR(receivable)} caption="Sisa tagihan" icon={AlertTriangle}/>
    </section>
    <section className="dashboard-grid">
      <article className="panel">
        <div className="panel-heading"><div><h3>Omzet 7 Hari</h3><p>Berdasarkan pembayaran order.</p></div></div>
        <div className="bar-chart">{chart.map(x=><div className="bar-column" key={x.label}><span>{formatIDR(x.total)}</span><div className="bar-track"><div className="bar-value" style={{height:`${Math.max(4,x.total/max*100)}%`}}/></div><b>{x.label}</b></div>)}</div>
      </article>
      <article className="panel">
        <div className="panel-heading"><div><h3>Status Order</h3><p>Order aktif saat ini.</p></div></div>
        <div className="status-summary">{(['received','washing','drying','ironing','packing','ready'] as const).map(s=><div key={s}><span className={`status-dot status-${s}`}/><span>{statusLabels[s]}</span><b>{orders.filter(r=>r.status===s).length}</b></div>)}</div>
      </article>
    </section>
    <section className="panel recent-orders">
      <div className="panel-heading"><div><h3>Order Terbaru</h3><p>10 transaksi terbaru.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Order</th><th>Pelanggan</th><th>Status</th><th>Total</th><th>Sisa</th><th>Dibuat</th></tr></thead>
      <tbody>{orders.slice(0,10).map(r=><tr key={r.id}><td><b>{r.order_no}</b></td><td><b>{r.customer_name}</b><small>{r.customer_phone}</small></td><td><span className={`badge status-${r.status}`}>{statusLabels[r.status]}</span></td><td>{formatIDR(r.total)}</td><td>{formatIDR(Math.max(0,Number(r.total)-Number(r.paid_amount)))}</td><td>{new Date(r.created_at).toLocaleString('id-ID')}</td></tr>)}
      {orders.length===0&&<tr><td colSpan={6} className="table-empty">Belum ada order.</td></tr>}</tbody></table></div>
    </section>
  </>
}
