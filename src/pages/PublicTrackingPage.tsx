import { useEffect, useMemo, useState } from 'react'
import { Check, Clock3, MapPin, MessageCircle, PackageCheck, Search, WashingMachine } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { formatIDR } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { OrderStatus } from '../types/order'

interface TrackingItem {
  service_name: string
  unit: string
  quantity: number
}

interface TrackingData {
  order_no: string
  customer_name: string
  status: OrderStatus
  payment_status: string
  total: number
  paid_amount: number
  due_at: string|null
  created_at: string
  items: TrackingItem[]
  business_name: string
  phone: string
  address: string
  maps_url: string
  operational_hours: string
}

const stages:Array<{key:OrderStatus;label:string}>=[
  {key:'received',label:'Diterima'},
  {key:'washing',label:'Dicuci'},
  {key:'drying',label:'Dikeringkan'},
  {key:'ironing',label:'Disetrika'},
  {key:'packing',label:'Packing'},
  {key:'ready',label:'Siap Diambil'}
]

export function PublicTrackingPage(){
  const {orderNo=''}=useParams()
  const [input,setInput]=useState(orderNo)
  const [data,setData]=useState<TrackingData|null>(null)
  const [loading,setLoading]=useState(false)
  const [message,setMessage]=useState('')

  const load=async(value:string)=>{
    const normalized=value.trim().toUpperCase()
    if(!normalized)return
    setLoading(true);setMessage('');setData(null)
    const {data:result,error}=await supabase.rpc('v103_public_order_tracking',{p_order_no:normalized})
    if(error)setMessage('Status order belum tersedia. Pastikan SQL V103 sudah dijalankan.')
    else if(!result)setMessage('Nomor order tidak ditemukan.')
    else setData(result as TrackingData)
    setLoading(false)
  }

  useEffect(()=>{if(orderNo)void load(orderNo)},[orderNo])

  const currentIndex=useMemo(()=>{
    if(!data)return -1
    if(data.status==='completed')return stages.length
    return stages.findIndex(stage=>stage.key===data.status)
  },[data])

  const search=(event:React.FormEvent)=>{
    event.preventDefault()
    window.history.replaceState(null,'',`/track/${encodeURIComponent(input.trim())}`)
    void load(input)
  }

  const wa=()=>{
    if(!data?.phone)return
    const phone=data.phone.replace(/\D/g,'').replace(/^0/,'62')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(`Halo ${data.business_name}, saya ingin menanyakan order ${data.order_no}.`)}`,'_blank')
  }

  return <main className="tracking-page">
    <header className="tracking-brand">
      <img src="/logo-happylaundry.jpg" alt="HappyLaundry"/>
      <div><b>{data?.business_name||'HappyLaundry Babakan'}</b><span>Status Laundry Online</span></div>
    </header>

    <section className="tracking-card tracking-search-card">
      <h1>Lacak Status Cucian</h1>
      <p>Masukkan nomor order yang tertera pada nota.</p>
      <form onSubmit={search}>
        <Search size={19}/><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Contoh: HL-260807-00001"/>
        <button disabled={loading}>{loading?'Memeriksa...':'Lacak'}</button>
      </form>
      {message&&<div className="tracking-error">{message}</div>}
    </section>

    {data&&<section className="tracking-card tracking-result">
      <div className="tracking-order-head">
        <div><span>Nomor Order</span><strong>{data.order_no}</strong><small>{data.customer_name}</small></div>
        <span className={`tracking-status tracking-${data.status}`}>{data.status==='completed'?'Selesai':stages.find(x=>x.key===data.status)?.label||data.status}</span>
      </div>

      <div className="tracking-progress">
        {stages.map((stage,index)=>{
          const done=index<currentIndex||data.status==='completed'
          const active=index===currentIndex&&data.status!=='completed'
          return <div className={`tracking-step ${done?'done':''} ${active?'active':''}`} key={stage.key}>
            <span>{done?<Check size={17}/>:active?<WashingMachine size={17}/>:index+1}</span>
            <b>{stage.label}</b>
          </div>
        })}
      </div>

      <div className="tracking-summary">
        <div><Clock3 size={19}/><span>Estimasi selesai<b>{data.due_at?new Date(data.due_at).toLocaleString('id-ID'):'Hubungi laundry'}</b></span></div>
        <div><PackageCheck size={19}/><span>Total<b>{formatIDR(Number(data.total))}</b></span></div>
        <div><MessageCircle size={19}/><span>Pembayaran<b>{Number(data.paid_amount)>=Number(data.total)?'Lunas':`Sisa ${formatIDR(Number(data.total)-Number(data.paid_amount))}`}</b></span></div>
      </div>

      <div className="tracking-items">
        <h2>Rincian Cucian</h2>
        {data.items?.map((item,index)=><div key={`${item.service_name}-${index}`}><span>{item.service_name}</span><b>{item.quantity} {item.unit}</b></div>)}
      </div>

      <div className="tracking-business">
        <MapPin size={18}/><div><b>{data.business_name}</b><span>{data.address}</span><small>{data.operational_hours}</small></div>
      </div>
      <div className="tracking-actions">
        {data.maps_url&&<a href={data.maps_url} target="_blank" rel="noreferrer"><MapPin size={16}/>Buka Maps</a>}
        <button onClick={wa}><MessageCircle size={16}/>Hubungi WhatsApp</button>
      </div>
    </section>}
    <footer className="tracking-footer">HappyLaundry Enterprise V103 • Status diperbarui oleh petugas laundry.</footer>
  </main>
}
