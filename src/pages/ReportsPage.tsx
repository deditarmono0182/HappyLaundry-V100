import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Printer, RefreshCw, TrendingUp, WalletCards, Users, Sparkles } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatIDR } from '../lib/format'
import { paymentLabels, statusLabels } from '../lib/order'
import { supabase } from '../lib/supabase'
import type { OrderRow } from '../types/order'

interface PaymentRow { id:string; order_id:string; amount:number; method:'cash'|'qris'|'transfer'|'other'; created_at:string }
interface CashRow { id:string; kind:'income'|'expense'; category:string; description:string; amount:number; method:string; created_at:string }
interface ItemRow { service_name:string; quantity:number; subtotal:number }
interface Period { start:string; end:string }

const todayText=()=>new Date().toISOString().slice(0,10)
const firstMonth=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`}
const endOfDay=(value:string)=>new Date(`${value}T23:59:59.999`).toISOString()
const startOfDay=(value:string)=>new Date(`${value}T00:00:00`).toISOString()

function csvCell(value:unknown){const text=String(value??'');return `"${text.replaceAll('"','""')}"`}
function downloadCsv(filename:string, rows:unknown[][]){
  const csv=rows.map(row=>row.map(csvCell).join(',')).join('\n')
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'})
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)
}

export function ReportsPage(){
  const [period,setPeriod]=useState<Period>({start:firstMonth(),end:todayText()})
  const [orders,setOrders]=useState<OrderRow[]>([])
  const [payments,setPayments]=useState<PaymentRow[]>([])
  const [cash,setCash]=useState<CashRow[]>([])
  const [items,setItems]=useState<ItemRow[]>([])
  const [loading,setLoading]=useState(false)
  const [message,setMessage]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const from=startOfDay(period.start),to=endOfDay(period.end)
    const [o,p,c,i]=await Promise.all([
      supabase.from('v100_orders_view').select('*').gte('created_at',from).lte('created_at',to).order('created_at',{ascending:false}),
      supabase.from('v100_payments').select('id,order_id,amount,method,created_at').gte('created_at',from).lte('created_at',to).order('created_at',{ascending:false}),
      supabase.from('v100_cash_transactions').select('id,kind,category,description,amount,method,created_at').gte('created_at',from).lte('created_at',to).order('created_at',{ascending:false}),
      supabase.from('v100_order_items').select('service_name,quantity,subtotal,created_at').gte('created_at',from).lte('created_at',to)
    ])
    const error=o.error||p.error||c.error||i.error
    if(error)setMessage(error.message)
    else {setOrders((o.data as OrderRow[])||[]);setPayments((p.data as PaymentRow[])||[]);setCash((c.data as CashRow[])||[]);setItems((i.data as ItemRow[])||[])}
    setLoading(false)
  },[period])

  useEffect(()=>{void load()},[load])

  const omzet=payments.reduce((s,r)=>s+Number(r.amount),0)
  const expense=cash.filter(r=>r.kind==='expense').reduce((s,r)=>s+Number(r.amount),0)
  const profit=omzet-expense
  const receivable=orders.reduce((s,r)=>s+Math.max(0,Number(r.total)-Number(r.paid_amount)),0)
  const completed=orders.filter(r=>r.status==='completed').length
  const avg=orders.length?orders.reduce((s,r)=>s+Number(r.total),0)/orders.length:0

  const paymentSummary=useMemo(()=>['cash','qris','transfer','other'].map(method=>({method,total:payments.filter(r=>r.method===method).reduce((s,r)=>s+Number(r.amount),0),count:payments.filter(r=>r.method===method).length})),[payments])
  const topServices=useMemo(()=>{
    const map=new Map<string,{qty:number,total:number}>();items.forEach(r=>{const old=map.get(r.service_name)||{qty:0,total:0};old.qty+=Number(r.quantity);old.total+=Number(r.subtotal);map.set(r.service_name,old)})
    return [...map.entries()].map(([name,v])=>({name,...v})).sort((a,b)=>b.total-a.total).slice(0,10)
  },[items])
  const topCustomers=useMemo(()=>{
    const map=new Map<string,{phone:string,count:number,total:number}>();orders.forEach(r=>{const old=map.get(r.customer_name)||{phone:r.customer_phone,count:0,total:0};old.count+=1;old.total+=Number(r.total);map.set(r.customer_name,old)})
    return [...map.entries()].map(([name,v])=>({name,...v})).sort((a,b)=>b.total-a.total).slice(0,10)
  },[orders])

  const exportOrders=()=>downloadCsv(`laporan-order-${period.start}-${period.end}.csv`,[
    ['Nomor Order','Tanggal','Pelanggan','WhatsApp','Status','Pembayaran','Total','Sudah Bayar','Sisa'],
    ...orders.map(r=>[r.order_no,new Date(r.created_at).toLocaleString('id-ID'),r.customer_name,r.customer_phone,statusLabels[r.status],paymentLabels[r.payment_status],r.total,r.paid_amount,Math.max(0,Number(r.total)-Number(r.paid_amount))])
  ])
  const exportCash=()=>downloadCsv(`laporan-kas-${period.start}-${period.end}.csv`,[
    ['Tanggal','Jenis','Kategori','Keterangan','Metode','Nominal'],
    ...cash.map(r=>[new Date(r.created_at).toLocaleString('id-ID'),r.kind==='income'?'Masuk':'Keluar',r.category,r.description,r.method,r.amount])
  ])

  return <>
    <PageHeader eyebrow="ENTERPRISE REPORTING" title="Laporan Owner" description="Analisis omzet, kas, piutang, pelanggan, dan layanan." action={<button className="secondary-button" onClick={()=>window.print()}><Printer size={17}/> Cetak</button>}/>
    <section className="panel report-filter">
      <label>Dari<input type="date" value={period.start} onChange={e=>setPeriod({...period,start:e.target.value})}/></label>
      <label>Sampai<input type="date" value={period.end} onChange={e=>setPeriod({...period,end:e.target.value})}/></label>
      <div className="quick-periods">
        <button onClick={()=>setPeriod({start:todayText(),end:todayText()})}>Hari Ini</button>
        <button onClick={()=>setPeriod({start:firstMonth(),end:todayText()})}>Bulan Ini</button>
      </div>
      <button className="primary-button" onClick={()=>void load()} disabled={loading}><RefreshCw size={17}/>{loading?'Memuat...':'Terapkan'}</button>
    </section>
    {message&&<div className="error-box inline-message">{message}</div>}
    <section className="stats-grid report-stats">
      <StatCard label="Omzet" value={formatIDR(omzet)} caption={`${payments.length} pembayaran`} icon={TrendingUp}/>
      <StatCard label="Pengeluaran" value={formatIDR(expense)} caption="Kas keluar" icon={WalletCards}/>
      <StatCard label="Laba Bersih" value={formatIDR(profit)} caption="Omzet dikurangi pengeluaran" icon={TrendingUp}/>
      <StatCard label="Piutang" value={formatIDR(receivable)} caption="Sisa tagihan" icon={WalletCards}/>
      <StatCard label="Order" value={String(orders.length)} caption={`${completed} selesai`} icon={FileSpreadsheet}/>
      <StatCard label="Rata-rata Order" value={formatIDR(avg)} caption="Nilai rata-rata transaksi" icon={TrendingUp}/>
    </section>

    <section className="report-grid">
      <article className="panel">
        <div className="panel-heading report-heading"><div><h3>Metode Pembayaran</h3><p>Komposisi pembayaran periode terpilih.</p></div></div>
        <div className="payment-report">{paymentSummary.map(r=><div key={r.method}><span>{r.method==='cash'?'Tunai':r.method==='qris'?'QRIS':r.method==='transfer'?'Transfer':'Lainnya'}</span><b>{formatIDR(r.total)}</b><small>{r.count} transaksi</small></div>)}</div>
      </article>
      <article className="panel">
        <div className="panel-heading report-heading"><div><h3>Ringkasan Order</h3><p>Status order pada periode ini.</p></div></div>
        <div className="status-summary">{(['received','washing','drying','ironing','packing','ready','completed'] as const).map(s=><div key={s}><span className={`status-dot status-${s}`}/><span>{statusLabels[s]}</span><b>{orders.filter(r=>r.status===s).length}</b></div>)}</div>
      </article>
    </section>

    <section className="report-grid">
      <article className="panel">
        <div className="panel-heading report-heading"><div><h3><Sparkles size={18}/> Layanan Terlaris</h3><p>Berdasarkan nilai transaksi.</p></div></div>
        <div className="ranking-list">{topServices.map((r,i)=><div key={r.name}><span className="rank">{i+1}</span><div><b>{r.name}</b><small>{r.qty.toLocaleString('id-ID')} unit</small></div><strong>{formatIDR(r.total)}</strong></div>)}{topServices.length===0&&<div className="table-empty">Belum ada data layanan.</div>}</div>
      </article>
      <article className="panel">
        <div className="panel-heading report-heading"><div><h3><Users size={18}/> Pelanggan Terbaik</h3><p>Berdasarkan total belanja.</p></div></div>
        <div className="ranking-list">{topCustomers.map((r,i)=><div key={r.name}><span className="rank">{i+1}</span><div><b>{r.name}</b><small>{r.phone} · {r.count} order</small></div><strong>{formatIDR(r.total)}</strong></div>)}{topCustomers.length===0&&<div className="table-empty">Belum ada data pelanggan.</div>}</div>
      </article>
    </section>

    <section className="panel report-table">
      <div className="panel-heading report-heading"><div><h3>Detail Order</h3><p>{period.start} sampai {period.end}</p></div><div className="report-actions"><button onClick={exportOrders}><Download size={16}/> CSV Order</button><button onClick={exportCash}><Download size={16}/> CSV Kas</button></div></div>
      <div className="table-wrap"><table><thead><tr><th>Order</th><th>Tanggal</th><th>Pelanggan</th><th>Status</th><th>Total</th><th>Bayar</th><th>Sisa</th></tr></thead><tbody>
        {orders.map(r=><tr key={r.id}><td><b>{r.order_no}</b></td><td>{new Date(r.created_at).toLocaleDateString('id-ID')}</td><td><b>{r.customer_name}</b><small>{r.customer_phone}</small></td><td><span className={`badge status-${r.status}`}>{statusLabels[r.status]}</span></td><td>{formatIDR(r.total)}</td><td>{formatIDR(r.paid_amount)}</td><td>{formatIDR(Math.max(0,Number(r.total)-Number(r.paid_amount)))}</td></tr>)}
        {orders.length===0&&<tr><td colSpan={7} className="table-empty">Belum ada order pada periode ini.</td></tr>}
      </tbody></table></div>
    </section>
  </>
}
