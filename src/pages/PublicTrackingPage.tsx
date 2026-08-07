import { useEffect, useMemo, useState } from 'react'
import {
  Check, Clock3, MapPin, MessageCircle, PackageCheck, Search,
  Sparkles, WashingMachine
} from 'lucide-react'
import { useParams } from 'react-router-dom'
import { formatIDR } from '../lib/format'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { OrderStatus, PaymentStatus } from '../types/order'

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

interface SearchOrder {
  id:string
  order_no:string
  customer_name:string
  customer_phone:string
  status:OrderStatus
  payment_status:PaymentStatus
  total:number
  paid_amount:number
  created_at:string
}

const stages:Array<{key:OrderStatus;label:string}>=[
  {key:'received',label:'Diterima'},
  {key:'washing',label:'Dicuci'},
  {key:'drying',label:'Dikeringkan'},
  {key:'ironing',label:'Disetrika'},
  {key:'packing',label:'Packing'},
  {key:'ready',label:'Siap Diambil'}
]

const statusLabel:Record<string,string>={
  received:'Diterima',
  washing:'Dicuci',
  drying:'Dikeringkan',
  ironing:'Disetrika',
  packing:'Packing',
  ready:'Siap Diambil',
  completed:'Selesai',
  cancelled:'Dibatalkan'
}

const paymentLabel:Record<string,string>={
  unpaid:'Belum Bayar',
  partial:'Sebagian',
  paid:'Lunas'
}

function normalizeSearch(value:string){
  return value.trim().toLowerCase()
}

export function PublicTrackingPage(){
  const {orderNo=''}=useParams()
  const {profile}=useAuth()
  const [input,setInput]=useState(orderNo)
  const [data,setData]=useState<TrackingData|null>(null)
  const [searchRows,setSearchRows]=useState<SearchOrder[]>([])
  const [loading,setLoading]=useState(false)
  const [message,setMessage]=useState('')
  const [now,setNow]=useState(Date.now())

  const isInternal=Boolean(profile)

  const load=async(value:string)=>{
    const normalized=value.trim().toUpperCase()
    if(!normalized)return
    setLoading(true);setMessage('');setData(null);setSearchRows([])
    const {data:result,error}=await supabase.rpc('v103_public_order_tracking',{p_order_no:normalized})
    if(error)setMessage('Status order belum tersedia. Pastikan SQL tracking sudah dijalankan.')
    else if(!result)setMessage('Nomor order tidak ditemukan.')
    else setData(result as TrackingData)
    setLoading(false)
  }

  const internalSearch=async(value:string)=>{
    const key=normalizeSearch(value)
    if(!key)return
    setLoading(true);setMessage('');setData(null);setSearchRows([])

    const{data:orders,error}=await supabase
      .from('v100_orders_view')
      .select('id,order_no,customer_name,customer_phone,status,payment_status,total,paid_amount,created_at')
      .order('created_at',{ascending:false})
      .limit(500)

    if(error){
      setMessage(error.message)
      setLoading(false)
      return
    }

    const filtered=((orders as SearchOrder[])||[]).filter(row=>{
      const values=[
        row.order_no,
        row.customer_name,
        row.customer_phone,
        statusLabel[row.status]||row.status,
        row.status,
        paymentLabel[row.payment_status]||row.payment_status,
        row.payment_status
      ].map(v=>String(v||'').toLowerCase())

      return values.some(v=>v.includes(key))
    }).slice(0,50)

    if(filtered.length===0){
      setMessage('Data tidak ditemukan.')
    }else if(filtered.length===1){
      await load(filtered[0].order_no)
      setLoading(false)
      return
    }else{
      setSearchRows(filtered)
    }
    setLoading(false)
  }

  useEffect(()=>{if(orderNo)void load(orderNo)},[orderNo])

  useEffect(()=>{
    const timer=window.setInterval(()=>setNow(Date.now()),60000)
    return()=>window.clearInterval(timer)
  },[])

  const currentIndex=useMemo(()=>{
    if(!data)return -1
    if(data.status==='completed')return stages.length
    return stages.findIndex(stage=>stage.key===data.status)
  },[data])

  const progress=useMemo(()=>{
    if(!data)return 0
    if(data.status==='completed')return 100
    if(currentIndex<0)return 0
    return Math.round(((currentIndex+1)/stages.length)*100)
  },[data,currentIndex])

  const countdown=useMemo(()=>{
    if(!data?.due_at)return 'Hubungi laundry'
    const diff=new Date(data.due_at).getTime()-now
    if(diff<=0)return data.status==='ready'||data.status==='completed'?'Sudah selesai':'Melewati estimasi'
    const minutes=Math.floor(diff/60000)
    const days=Math.floor(minutes/1440)
    const hours=Math.floor((minutes%1440)/60)
    const mins=minutes%60
    if(days>0)return `${days} hari ${hours} jam lagi`
    if(hours>0)return `${hours} jam ${mins} menit lagi`
    return `${Math.max(1,mins)} menit lagi`
  },[data,now])

  const dueLabel=useMemo(()=>{
    if(!data?.due_at)return ''
    return new Date(data.due_at).toLocaleString('id-ID',{
      weekday:'long',day:'2-digit',month:'long',year:'numeric',
      hour:'2-digit',minute:'2-digit'
    })
  },[data])

  const search=(event:React.FormEvent)=>{
    event.preventDefault()
    const value=input.trim()
    if(!value)return

    if(isInternal){
      void internalSearch(value)
      return
    }

    window.history.replaceState(null,'',`/track/${encodeURIComponent(value)}`)
    void load(value)
  }

  const chooseResult=(row:SearchOrder)=>{
    setInput(row.order_no)
    setSearchRows([])
    window.history.replaceState(null,'',`/track/${encodeURIComponent(row.order_no)}`)
    void load(row.order_no)
  }

  const wa=()=>{
    if(!data?.phone)return
    const phone=data.phone.replace(/\D/g,'').replace(/^0/,'62')
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(`Halo ${data.business_name}, saya ingin menanyakan order ${data.order_no}.`)}`,
      '_blank'
    )
  }

  const isReady=data?.status==='ready'||data?.status==='completed'

  return <main className="tracking-page tracking-premium tracking-v2">
    <header className="tracking-brand tracking-brand-premium">
      <img src="/logo-happylaundry.jpg" alt="HappyLaundry"/>
      <div><b>{data?.business_name||'HappyLaundry Babakan'}</b><span>Status Laundry Online</span></div>
    </header>

    <section className="tracking-card tracking-search-card">
      <h1>{isInternal?'Cari & Tracking Order':'Lacak Status Cucian'}</h1>
      <p>{isInternal
        ? 'Cari nomor order, pelanggan, telepon, status cucian, atau status pembayaran.'
        : 'Masukkan nomor order yang tertera pada nota.'}</p>

      <form onSubmit={search}>
        <Search size={20}/>
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          placeholder={isInternal?'Order / pelanggan / telepon / status / pembayaran':'Contoh: HL-260807-00001'}
        />
        <button disabled={loading}>{loading?'Mencari...':'Cari'}</button>
      </form>

      {isInternal&&<div className="tracking-search-hints">
        <span>Contoh:</span>
        <button type="button" onClick={()=>setInput('Dicuci')}>Dicuci</button>
        <button type="button" onClick={()=>setInput('Lunas')}>Lunas</button>
        <button type="button" onClick={()=>setInput('Belum Bayar')}>Belum Bayar</button>
      </div>}

      {message&&<div className="tracking-error">{message}</div>}
    </section>

    {searchRows.length>0&&<section className="tracking-card tracking-search-results">
      <div className="tracking-results-head">
        <div><b>Hasil Pencarian</b><span>{searchRows.length} data ditemukan</span></div>
      </div>
      <div className="tracking-results-list">
        {searchRows.map(row=><button type="button" key={row.id} onClick={()=>chooseResult(row)}>
          <div className="tracking-result-main">
            <b>{row.order_no}</b>
            <span>{row.customer_name}</span>
            <small>{row.customer_phone||'-'}</small>
          </div>
          <div className="tracking-result-status">
            <span className={`tracking-mini-status tracking-${row.status}`}>{statusLabel[row.status]||row.status}</span>
            <span className={`tracking-mini-payment payment-${row.payment_status}`}>{paymentLabel[row.payment_status]||row.payment_status}</span>
          </div>
          <div className="tracking-result-money">
            <b>{formatIDR(Number(row.total))}</b>
            <small>{new Date(row.created_at).toLocaleDateString('id-ID')}</small>
          </div>
        </button>)}
      </div>
    </section>}

    {data&&<section className="tracking-card tracking-result">
      {isReady&&<div className="tracking-ready-banner">
        <Sparkles size={27}/>
        <div>
          <b>{data.status==='completed'?'Laundry Anda sudah selesai':'Laundry Anda siap diambil!'}</b>
          <span>{data.status==='completed'?'Terima kasih telah menggunakan HappyLaundry.':'Silakan datang ke outlet untuk mengambil cucian Anda.'}</span>
        </div>
      </div>}

      <div className="tracking-order-head">
        <div>
          <span>Nomor Order</span>
          <strong>{data.order_no}</strong>
          <small>{data.customer_name}</small>
        </div>
        <span className={`tracking-status tracking-${data.status}`}>{statusLabel[data.status]||data.status}</span>
      </div>

      <div className="tracking-progress-meter tracking-progress-meter-clean">
        <div className="tracking-progress-top">
          <span>Progress Cucian</span>
          <b>{progress}%</b>
        </div>
        <div className="tracking-progress-bar"><i style={{width:`${progress}%`}}/></div>
      </div>

      <div className="tracking-progress tracking-progress-clean">
        {stages.map((stage,index)=>{
          const done=index<currentIndex||data.status==='completed'
          const active=index===currentIndex&&data.status!=='completed'
          return <div className={`tracking-step ${done?'done':''} ${active?'active':''}`} key={stage.key}>
            <span>{done?<Check size={18}/>:active?<WashingMachine size={18}/>:index+1}</span>
            <b>{stage.label}</b>
          </div>
        })}
      </div>

      <div className="tracking-summary tracking-summary-premium">
        <div>
          <Clock3 size={22}/>
          <span>Estimasi selesai
            <b>{countdown}</b>
            {dueLabel&&<small>{dueLabel}</small>}
          </span>
        </div>
        <div>
          <PackageCheck size={22}/>
          <span>Total<b>{formatIDR(Number(data.total))}</b></span>
        </div>
        <div>
          <MessageCircle size={22}/>
          <span>Pembayaran
            <b>{Number(data.paid_amount)>=Number(data.total)?'Lunas':`Sisa ${formatIDR(Number(data.total)-Number(data.paid_amount))}`}</b>
          </span>
        </div>
      </div>

      <div className="tracking-items">
        <h2>Rincian Cucian</h2>
        {data.items?.map((item,index)=><div key={`${item.service_name}-${index}`}>
          <span>{item.service_name}</span>
          <b>{item.quantity} {item.unit}</b>
        </div>)}
      </div>

      <div className="tracking-business">
        <MapPin size={20}/>
        <div>
          <b>{data.business_name}</b>
          <span>{data.address}</span>
          <small>{data.operational_hours}</small>
        </div>
      </div>

      <div className="tracking-actions">
        {data.maps_url&&<a href={data.maps_url} target="_blank" rel="noreferrer"><MapPin size={17}/>Buka Maps</a>}
        <button onClick={wa}><MessageCircle size={17}/>Hubungi WhatsApp</button>
      </div>
    </section>}

    <footer className="tracking-footer">HappyLaundry Enterprise V110.2 • Status diperbarui oleh petugas laundry.</footer>
  </main>
}
