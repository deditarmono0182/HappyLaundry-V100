import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { CircleDollarSign, CreditCard, Search, WalletCards } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { formatIDR } from '../lib/format'
import { paymentLabels } from '../lib/order'
import { supabase } from '../lib/supabase'
import type { OrderRow } from '../types/order'

type Method='cash'|'qris'|'transfer'|'other'
const methodLabels:Record<Method,string>={cash:'Tunai',qris:'QRIS',transfer:'Transfer',other:'Lainnya'}

export function PaymentsPage(){
  const [rows,setRows]=useState<OrderRow[]>([])
  const [query,setQuery]=useState('')
  const [selected,setSelected]=useState<OrderRow|null>(null)
  const [amount,setAmount]=useState(0)
  const [method,setMethod]=useState<Method>('cash')
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)

  const load=useCallback(async()=>{
    const {data,error}=await supabase.from('v100_orders_view').select('*').order('created_at',{ascending:false})
    if(error)setMessage(error.message)
    else setRows(((data as OrderRow[])||[]).filter(r=>Number(r.paid_amount)<Number(r.total)))
  },[])
  useEffect(()=>{void load()},[load])

  const filtered=useMemo(()=>{const k=query.toLowerCase().trim();return !k?rows:rows.filter(r=>`${r.order_no} ${r.customer_name} ${r.customer_phone}`.toLowerCase().includes(k))},[rows,query])
  const receivable=rows.reduce((s,r)=>s+Math.max(0,Number(r.total)-Number(r.paid_amount)),0)

  const openPay=(row:OrderRow)=>{setSelected(row);setAmount(Number(row.total)-Number(row.paid_amount));setMethod('cash');setMessage('')}
  const submit=async(e:FormEvent)=>{
    e.preventDefault();if(!selected)return
    const remaining=Number(selected.total)-Number(selected.paid_amount)
    if(amount<=0||amount>remaining){setMessage('Nominal pembayaran tidak valid.');return}
    setBusy(true)
    const {error}=await supabase.rpc('v100_add_payment',{p_order_id:selected.id,p_amount:Number(amount),p_method:method,p_notes:null})
    if(error)setMessage(error.message)
    else{setSelected(null);await load()}
    setBusy(false)
  }

  return <>
    <PageHeader eyebrow="KASIR" title="Pembayaran" description="Terima pelunasan order melalui Tunai, QRIS, atau Transfer."/>
    <section className="stats-grid compact-stats">
      <article className="stat-card"><div className="stat-icon"><WalletCards size={22}/></div><div><span>Order Belum Lunas</span><strong>{rows.length}</strong><small>Perlu ditagihkan</small></div></article>
      <article className="stat-card"><div className="stat-icon"><CircleDollarSign size={22}/></div><div><span>Total Piutang</span><strong>{formatIDR(receivable)}</strong><small>Sisa seluruh order</small></div></article>
      <article className="stat-card"><div className="stat-icon"><CreditCard size={22}/></div><div><span>Metode Pembayaran</span><strong>4</strong><small>Tunai, QRIS, transfer, lainnya</small></div></article>
    </section>
    <section className="panel data-panel"><div className="toolbar"><label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari order atau pelanggan"/></label><span className="record-count">{filtered.length} tagihan</span></div>
      {message&&<div className="error-box inline-message">{message}</div>}
      <div className="table-wrap"><table><thead><tr><th>Order</th><th>Pelanggan</th><th>Total</th><th>Sudah Bayar</th><th>Sisa</th><th>Status</th><th/></tr></thead><tbody>
      {filtered.length===0&&<tr><td colSpan={7} className="table-empty">Tidak ada tagihan belum lunas.</td></tr>}
      {filtered.map(r=><tr key={r.id}><td><b>{r.order_no}</b></td><td><b>{r.customer_name}</b><small>{r.customer_phone}</small></td><td>{formatIDR(Number(r.total))}</td><td>{formatIDR(Number(r.paid_amount))}</td><td><b>{formatIDR(Number(r.total)-Number(r.paid_amount))}</b></td><td><span className={`badge payment-${r.payment_status}`}>{paymentLabels[r.payment_status]}</span></td><td><button className="small-primary" onClick={()=>openPay(r)}>Bayar</button></td></tr>)}
      </tbody></table></div>
    </section>
    {selected&&<Modal title={`Pembayaran ${selected.order_no}`} onClose={()=>setSelected(null)}><form className="modal-form" onSubmit={submit}>
      <div className="payment-summary"><div><span>Pelanggan</span><b>{selected.customer_name}</b></div><div><span>Sisa Tagihan</span><b>{formatIDR(Number(selected.total)-Number(selected.paid_amount))}</b></div></div>
      <label>Nominal Pembayaran<input type="number" min="1" max={Number(selected.total)-Number(selected.paid_amount)} value={amount} onChange={e=>setAmount(Number(e.target.value))}/></label>
      <label>Metode<select value={method} onChange={e=>setMethod(e.target.value as Method)}>{Object.entries(methodLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      {message&&<div className="error-box">{message}</div>}
      <div className="form-actions"><button type="button" className="secondary-button" onClick={()=>setSelected(null)}>Batal</button><button className="primary-button" disabled={busy}>{busy?'Memproses...':'Simpan Pembayaran'}</button></div>
    </form></Modal>}
  </>
}
