import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, MessageCircle, Search, WashingMachine } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { statusLabels } from '../lib/order'
import { supabase } from '../lib/supabase'
import type { OrderRow, OrderStatus } from '../types/order'

const columns:OrderStatus[]=['received','washing','drying','ironing','packing','ready']
const next:Partial<Record<OrderStatus,OrderStatus>>={received:'washing',washing:'drying',drying:'ironing',ironing:'packing',packing:'ready',ready:'completed'}

const phone=(v:string)=>{const x=v.replace(/\D/g,'');return x.startsWith('0')?'62'+x.slice(1):x}
const rupiah=(v:number)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(v)

export function ProductionPage(){
  const [searchParams]=useSearchParams()
  const [rows,setRows]=useState<OrderRow[]>([])
  const [query,setQuery]=useState('')
  useEffect(()=>{
    const orderParam=searchParams.get('order')?.trim()
    if(orderParam)setQuery(orderParam)
  },[searchParams])
  const [filter,setFilter]=useState<'all'|'overdue'>('all')
  const [message,setMessage]=useState('')
  const [settings,setSettings]=useState({business_name:'HappyLaundry Babakan',whatsapp_ready_template:'Halo {nama}, laundry {order} sudah siap diambil. Terima kasih. {usaha}'})

  const load=useCallback(async()=>{
    const [o,s]=await Promise.all([
      supabase.from('v100_orders_view').select('*').not('status','in','("completed","cancelled")').order('created_at'),
      supabase.from('v100_store_settings').select('business_name,whatsapp_ready_template').limit(1).maybeSingle()
    ])
    if(o.error||s.error)setMessage((o.error||s.error)?.message||'Gagal memuat')
    else {setRows((o.data as OrderRow[])||[]);if(s.data)setSettings(s.data)}
  },[])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{
    const channel=supabase.channel('v103-production-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'v100_orders'},()=>{void load()})
      .subscribe()
    return()=>{void supabase.removeChannel(channel)}
  },[load])
  useEffect(()=>{
    const timer=window.setInterval(()=>{void load()},15000)
    return()=>window.clearInterval(timer)
  },[load])

  const filtered=useMemo(()=>{
    const q=query.toLowerCase().trim()
    const searched=q?rows.filter(r=>`${r.order_no} ${r.customer_name} ${r.customer_phone}`.toLowerCase().includes(q)):rows
    if(filter==='overdue')return searched.filter(r=>r.due_at&&new Date(r.due_at)<new Date())
    return searched
  },[query,rows,filter])

  const isOverdue=(row:OrderRow)=>Boolean(row.due_at&&new Date(row.due_at)<new Date()&&row.status!=='ready')

  const whatsapp=(r:OrderRow)=>{
    const p=phone(r.customer_phone)
    if(!p){setMessage('Nomor WhatsApp pelanggan tidak tersedia.');return}
    const trackingUrl=`${window.location.origin}/track/${encodeURIComponent(r.order_no)}`
    const baseText=settings.whatsapp_ready_template.replaceAll('{nama}',r.customer_name).replaceAll('{order}',r.order_no).replaceAll('{total}',rupiah(Number(r.total))).replaceAll('{usaha}',settings.business_name)
    const text=`${baseText}\n\nCek status laundry:\n${trackingUrl}`
    window.open(`https://wa.me/${p}?text=${encodeURIComponent(text)}`,'_blank')
  }

  const move=async(r:OrderRow)=>{
    const n=next[r.status]; if(!n)return
    const {error}=await supabase.from('v100_orders').update({status:n,updated_at:new Date().toISOString()}).eq('id',r.id)
    if(error)setMessage(error.message)
    else {await load();if(n==='ready')whatsapp({...r,status:n})}
  }

  return <>
    <PageHeader eyebrow="PRODUKSI STABLE" title="Papan Proses Cucian" description="Cari, pantau keterlambatan, dan pindahkan order sesuai tahap proses."
      action={<div className="production-tools">
        <select value={filter} onChange={e=>setFilter(e.target.value as 'all'|'overdue')} aria-label="Filter produksi">
          <option value="all">Semua order aktif</option>
          <option value="overdue">Terlambat saja</option>
        </select>
        <label className="search-box production-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari order, nama, atau WhatsApp"/></label>
      </div>}/>
    {message&&<div className="error-box inline-message">{message}</div>}
    <div className="production-board">{columns.map(s=>{
      const list=filtered.filter(r=>r.status===s)
      return <section className={`production-column production-${s}`} key={s}>
        <header><div><span className={`status-dot status-${s}`}/><b>{statusLabels[s]}</b></div><span>{list.length}</span></header>
        <div className="production-cards">{list.map(r=><article className={`production-card ${isOverdue(r)?'production-overdue':''}`} key={r.id}>
          <div className="production-card-head"><div><b>{r.order_no}</b><small>{r.customer_name}</small></div><span className={`badge payment-${r.payment_status}`}>{r.payment_status==='paid'?'Lunas':r.payment_status==='partial'?'DP':'Belum Bayar'}</span></div>
          <small>WA: {r.customer_phone||'-'}</small>
          {r.due_at&&<small className={isOverdue(r)?'overdue-text':''}>
            {isOverdue(r)?'⚠ Terlambat: ':'Estimasi: '}{new Date(r.due_at).toLocaleString('id-ID')}
          </small>}
          <div className="production-card-actions">
          <button className="whatsapp-button" onClick={()=>whatsapp(r)}><MessageCircle size={15}/>Kirim Update WA</button>
          <button onClick={()=>void move(r)}>{s==='ready'?'Selesaikan':'Tahap Berikutnya'}<ChevronRight size={15}/></button></div>
        </article>)}
        {list.length===0&&<div className="production-empty"><WashingMachine size={24}/>Kosong</div>}</div>
      </section>})}</div>
  </>
}
