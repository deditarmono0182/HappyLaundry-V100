import { useCallback, useEffect, useMemo, useState } from 'react'
import { CreditCard, Eye, Search, TrendingUp, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatRupiah } from '../lib/format'
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
}

export function IncomeDetailsPage(){
  const navigate=useNavigate()
  const [payments,setPayments]=useState<PaymentRow[]>([])
  const [orders,setOrders]=useState<OrderRowLite[]>([])
  const [query,setQuery]=useState('')
  const [from,setFrom]=useState(()=>{
    const d=new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
  })
  const [to,setTo]=useState(()=>new Date().toISOString().slice(0,10))
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const [p,o]=await Promise.all([
      supabase.from('v100_payments')
        .select('id,order_id,amount,method,created_at')
        .gte('created_at',`${from}T00:00:00`)
        .lte('created_at',`${to}T23:59:59.999`)
        .order('created_at',{ascending:false}),
      supabase.from('v100_orders_view')
        .select('id,order_no,customer_name,total,paid_amount')
    ])
    const error=p.error||o.error
    if(error)setMessage(error.message)
    else{
      setPayments((p.data as PaymentRow[])||[])
      setOrders((o.data as OrderRowLite[])||[])
    }
    setLoading(false)
  },[from,to])

  useEffect(()=>{void load()},[load])

  const orderMap=useMemo(()=>new Map(orders.map(o=>[o.id,o])),[orders])

  const filtered=useMemo(()=>{
    const key=query.toLowerCase().trim()
    if(!key)return payments
    return payments.filter(p=>{
      const o=orderMap.get(p.order_id)
      return `${o?.order_no||''} ${o?.customer_name||''} ${p.method||''}`.toLowerCase().includes(key)
    })
  },[payments,query,orderMap])

  const total=payments.reduce((sum,p)=>sum+Number(p.amount||0),0)
  const avg=payments.length?total/payments.length:0

  return <>
    <PageHeader
      eyebrow="FINANCE & ACCOUNTING"
      title="Daftar Pemasukan"
      description="Daftar pembayaran order yang benar-benar sudah diterima."
    />

    <section className="panel finance-filter">
      <label>Dari<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Sampai<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <div><span>Periode daftar pemasukan</span></div>
    </section>

    <section className="stats-grid finance-detail-stats">
      <StatCard icon={TrendingUp} label="Total Pemasukan" value={formatRupiah(total)} caption={`${payments.length} pembayaran`}/>
      <StatCard icon={CreditCard} label="Jumlah Pembayaran" value={String(payments.length)} caption="Transaksi pembayaran"/>
      <StatCard icon={WalletCards} label="Rata-rata Pembayaran" value={formatRupiah(avg)} caption="Rata-rata pembayaran masuk"/>
    </section>

    <section className="panel data-panel">
      <div className="toolbar">
        <label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari order, pelanggan, atau metode"/></label>
        <span className="record-count">{filtered.length} pembayaran</span>
      </div>
      {message&&<div className="error-box inline-message">{message}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Tanggal</th><th>Order</th><th>Pelanggan</th><th>Metode</th><th>Nominal</th><th>Aksi</th></tr></thead>
          <tbody>
            {loading&&<tr><td colSpan={6} className="table-empty">Memuat pemasukan...</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={6} className="table-empty">Belum ada pemasukan di periode ini.</td></tr>}
            {filtered.map(p=>{
              const o=orderMap.get(p.order_id)
              return <tr key={p.id}>
                <td>{new Date(p.created_at).toLocaleString('id-ID')}</td>
                <td><b>{o?.order_no||'-'}</b></td>
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
