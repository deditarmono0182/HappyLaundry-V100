import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CreditCard, Eye, FileSpreadsheet, FileText, Search, TrendingUp, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatRupiah } from '../lib/format'
import { downloadXls, printPdf } from '../lib/exportData'
import {readDashboardPages} from '../lib/dashboardPages'
import {addBusinessDays,businessDateKey,businessMonthKey,businessDateTimeLabel} from '../lib/businessTime'
import { supabase } from '../lib/supabase'

interface PaymentRow{
  id:string
  order_id:string
  amount:number
  method:string
  created_at:string
}

interface OrderRowLite{
  id:string
  order_no:string
  customer_name:string
  total:number
  paid_amount:number
  created_at:string
}

export function IncomeDetailsPage(){
  const navigate=useNavigate()
  const [payments,setPayments]=useState<PaymentRow[]>([])
  const [orders,setOrders]=useState<OrderRowLite[]>([])
  const [query,setQuery]=useState('')
  const [from,setFrom]=useState(()=>businessMonthKey()+'-01')
  const [to,setTo]=useState(()=>businessDateKey())
  const [origin,setOrigin]=useState('all')
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const sequence=useRef(0)

  const load=useCallback(async()=>{
    const seq=++sequence.current
    setLoading(true);setMessage('');setPayments([]);setOrders([])
    try{
      if(!from||!to||from>to)throw new Error('Pilih rentang tanggal pembayaran yang benar.')
      const p=await readDashboardPages(()=>supabase.from('v100_payments')
        .select('id,order_id,amount,method,created_at')
        .gte('created_at',from+'T00:00:00+07:00')
        .lt('created_at',addBusinessDays(to,1)+'T00:00:00+07:00')
        .order('created_at',{ascending:false}).order('id',{ascending:false}))
      if(p.error)throw new Error(p.error.message)
      const rows=(p.data||[]) as PaymentRow[]
      const ids=Array.from(new Set(rows.map(p=>p.order_id))),all:OrderRowLite[]=[]
      for(let i=0;i<ids.length;i+=100){
        const o=await readDashboardPages(()=>supabase.from('v100_orders_view')
          .select('id,order_no,customer_name,total,paid_amount,created_at').in('id',ids.slice(i,i+100)).order('id',{ascending:true}))
        if(o.error)throw new Error(o.error.message)
        all.push(...(o.data||[]) as OrderRowLite[])
      }
      if(rows.some(p=>!all.some(o=>o.id===p.order_id)))throw new Error('Data nota belum lengkap. Muat ulang untuk menghitung total yang benar.')
      if(seq===sequence.current){setPayments(rows);setOrders(all)}
    }catch(e){if(seq===sequence.current)setMessage(e instanceof Error?e.message:String(e))}
    finally{if(seq===sequence.current)setLoading(false)}
  },[from,to])

  useEffect(()=>{void load();return()=>{++sequence.current}},[load])

  const orderMap=useMemo(()=>new Map(orders.map(o=>[o.id,o])),[orders])

  const filtered=useMemo(()=>{
    const key=query.toLowerCase().trim()
    return payments.filter(p=>{
      const o=orderMap.get(p.order_id)
      const month=o?businessMonthKey(o.created_at):''
      if(origin==='old'&&(!month||month>=from.slice(0,7)))return false
      if(origin==='period'&&month!==from.slice(0,7))return false
      return `${o?.order_no||''} ${o?.customer_name||''} ${p.method||''}`.toLowerCase().includes(key)
    })
  },[payments,query,orderMap,origin,from])

  const exportRows=useMemo(()=>filtered.map(p=>{
    const o=orderMap.get(p.order_id)
    return[
      businessDateTimeLabel(p.created_at),
      o?.order_no||'-',
      o?businessDateTimeLabel(o.created_at):'-',
      o?.customer_name||'-',
      (p.method||'lainnya').toUpperCase(),
      Number(p.amount||0)
    ]
  }),[filtered,orderMap])

  const exportOptions=()=>({
    title:'Daftar Pemasukan',
    filename:`pemasukan-${from}-${to}`,
    subtitle:`Pembayaran ${from} s/d ${to} • ${origin==='old'?'Nota bulan sebelumnya':origin==='period'?'Nota bulan '+from.slice(0,7):'Semua nota'}`,
    headers:['Tanggal Bayar (WIB)','Order','Tanggal Nota (WIB)','Pelanggan','Metode','Nominal'],
    rows:exportRows,
    summary:[
      ['Jumlah Pembayaran',filtered.length],
      ['Total Pemasukan',filtered.reduce((sum,p)=>sum+Number(p.amount||0),0)]
    ] as Array<[string,string|number]>
  })

  const total=filtered.reduce((sum,p)=>sum+Number(p.amount||0),0)
  const avg=filtered.length?total/filtered.length:0

  return <>
    <PageHeader
      eyebrow="FINANCE & ACCOUNTING"
      title="Daftar Pemasukan"
      description="Daftar pembayaran order yang benar-benar sudah diterima."
      action={<div className="export-actions">
        <button className="secondary-button" disabled={loading||!!message} onClick={()=>downloadXls(exportOptions())}><FileSpreadsheet size={16}/>XLS</button>
        <button className="secondary-button" disabled={loading||!!message} onClick={()=>printPdf(exportOptions())}><FileText size={16}/>PDF</button>
      </div>}
    />

    <section className="panel finance-filter">
      <label>Dari<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Sampai<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <label>Bulan penerimaan<input type="month" value={from.slice(0,7)} onChange={e=>{if(e.target.value){const [y,m]=e.target.value.split('-').map(Number);setFrom(e.target.value+'-01');setTo(businessDateKey(new Date(Date.UTC(y,m,0,5))))}}}/></label>
      <label>Asal nota<select value={origin} onChange={e=>setOrigin(e.target.value)}><option value="all">Semua nota</option><option value="old">Nota bulan sebelumnya</option><option value="period">Nota bulan penerimaan</option></select></label>
      <button className="secondary-button" onClick={()=>void load()} disabled={loading}>Muat Ulang</button>
      <p>Uang diterima pada {from} s/d {to} (WIB). Nota bulan sebelumnya berarti nota dibuat sebelum {from.slice(0,7)}. Termasuk pembayaran sebagian jika ada; nominal dihitung dari uang yang diterima, bukan total harga nota.</p>
    </section>

    <section className="stats-grid finance-detail-stats">
      <StatCard icon={TrendingUp} label={origin==='old'?'Kas Masuk Nota Lama':'Total Pemasukan'} value={loading||message?'—':formatRupiah(total)} caption={`${filtered.length} pembayaran sesuai filter`}/>
      <StatCard icon={CreditCard} label="Jumlah Pembayaran" value={loading||message?'—':String(filtered.length)} caption="Transaksi pembayaran"/>
      <StatCard icon={WalletCards} label="Rata-rata Pembayaran" value={loading||message?'—':formatRupiah(avg)} caption="Rata-rata pembayaran masuk"/>
    </section>

    <section className="panel data-panel finance-income-list-panel">
      <div className="toolbar finance-income-list-toolbar">
        <label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari order, pelanggan, atau metode"/></label>
        <span className="record-count">{filtered.length} pembayaran</span>
      </div>
      {message&&<div className="error-box inline-message">{message}</div>}
      <div className="table-wrap finance-income-list-scroll">
        <table className="finance-income-list-table">
          <thead><tr><th>Tanggal</th><th>Order / Tanggal Nota</th><th>Pelanggan</th><th>Metode</th><th>Nominal</th><th>Aksi</th></tr></thead>
          <tbody>
            {loading&&<tr><td colSpan={6} className="table-empty">Memuat pemasukan...</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={6} className="table-empty">Belum ada pemasukan di periode ini.</td></tr>}
            {filtered.map(p=>{
              const o=orderMap.get(p.order_id)
              return <tr key={p.id}>
                <td>{businessDateTimeLabel(p.created_at)}</td>
                <td><b>{o?.order_no||'-'}</b><br/><small>{o?businessDateTimeLabel(o.created_at):'-'}</small></td>
                <td>{o?.customer_name||'-'}</td>
                <td><span className="badge">{(p.method||'lainnya').toUpperCase()}</span></td>
                <td><b className="income-amount">{formatRupiah(Number(p.amount))}</b></td>
                <td>{o&&<button className="finance-row-action" onClick={()=>navigate(`/orders?order=${encodeURIComponent(o.order_no)}`)}><Eye size={15}/> Detail</button>}</td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
    </section>
  </>
}
