import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera, CheckCircle2, ChevronRight, MessageCircle, QrCode, Search,
  StopCircle, WashingMachine, X
} from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { statusLabels } from '../lib/order'
import { supabase } from '../lib/supabase'
import type { OrderRow, OrderStatus } from '../types/order'

const columns:OrderStatus[]=['received','washing','drying','ironing','packing','ready']
const next:Partial<Record<OrderStatus,OrderStatus>>={
  received:'washing',
  washing:'drying',
  drying:'ironing',
  ironing:'packing',
  packing:'ready',
  ready:'completed'
}

const phone=(v:string)=>{
  const x=v.replace(/\D/g,'')
  return x.startsWith('0')?'62'+x.slice(1):x
}

const rupiah=(v:number)=>
  new Intl.NumberFormat('id-ID',{
    style:'currency',
    currency:'IDR',
    maximumFractionDigits:0
  }).format(v)

function extractOrderNo(raw:string){
  const value=raw.trim()
  if(!value)return ''

  // QR nota HappyLaundry normally contains:
  // https://domain/track/HL-XXXXXXXX
  try{
    const url=new URL(value)
    const parts=url.pathname.split('/').filter(Boolean)
    const trackIndex=parts.findIndex(part=>part.toLowerCase()==='track')
    if(trackIndex>=0&&parts[trackIndex+1]){
      return decodeURIComponent(parts[trackIndex+1]).trim().toUpperCase()
    }
  }catch{}

  // Also accept QR containing only the order number.
  const decoded=decodeURIComponent(value)
  const direct=decoded.match(/\bHL-[A-Z0-9-]+\b/i)
  return direct?.[0]?.toUpperCase()||decoded.toUpperCase()
}

export function ProductionPage(){
  const[searchParams]=useSearchParams()
  const[rows,setRows]=useState<OrderRow[]>([])
  const[query,setQuery]=useState('')
  const[filter,setFilter]=useState<'all'|'overdue'>('all')
  const[message,setMessage]=useState('')
  const[success,setSuccess]=useState('')
  const[scanning,setScanning]=useState(false)
  const[scanBusy,setScanBusy]=useState(false)
  const[scanOrder,setScanOrder]=useState<OrderRow|null>(null)
  const[scanOpen,setScanOpen]=useState(false)
  const scannerRef=useRef<Html5Qrcode|null>(null)
  const highlightedRef=useRef<string|null>(null)

  const[settings,setSettings]=useState({
    business_name:'HappyLaundry Babakan',
    whatsapp_ready_template:'Halo {nama}, laundry {order} sudah siap diambil. Terima kasih. {usaha}'
  })

  useEffect(()=>{
    const orderParam=searchParams.get('order')?.trim()
    if(orderParam)setQuery(orderParam)
  },[searchParams])

  const load=useCallback(async()=>{
    const[o,s]=await Promise.all([
      supabase
        .from('v100_orders_view')
        .select('*')
        .not('status','in','("completed","cancelled")')
        .order('created_at'),
      supabase
        .from('v100_store_settings')
        .select('business_name,whatsapp_ready_template')
        .limit(1)
        .maybeSingle()
    ])

    if(o.error||s.error){
      setMessage((o.error||s.error)?.message||'Gagal memuat')
    }else{
      const nextRows=(o.data as OrderRow[])||[]
      setRows(nextRows)
      if(s.data)setSettings(s.data)

      if(highlightedRef.current){
        const found=nextRows.find(r=>r.order_no===highlightedRef.current)
        if(found)setScanOrder(found)
      }
    }
  },[])

  useEffect(()=>{void load()},[load])

  useEffect(()=>{
    const channel=supabase.channel('v1124-production-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'v100_orders'},()=>{void load()})
      .subscribe()

    return()=>{void supabase.removeChannel(channel)}
  },[load])

  useEffect(()=>{
    const timer=window.setInterval(()=>{void load()},15000)
    return()=>window.clearInterval(timer)
  },[load])

  const stopScanner=useCallback(async()=>{
    const scanner=scannerRef.current
    if(scanner){
      try{
        if(scanner.isScanning)await scanner.stop()
        await scanner.clear()
      }catch{}
      scannerRef.current=null
    }
    setScanning(false)
  },[])

  useEffect(()=>()=>{void stopScanner()},[stopScanner])

  const filtered=useMemo(()=>{
    const q=query.toLowerCase().trim()
    const searched=q
      ? rows.filter(r=>`${r.order_no} ${r.customer_name} ${r.customer_phone}`.toLowerCase().includes(q))
      : rows

    if(filter==='overdue'){
      return searched.filter(r=>r.due_at&&new Date(r.due_at)<new Date())
    }
    return searched
  },[query,rows,filter])

  const isOverdue=(row:OrderRow)=>
    Boolean(row.due_at&&new Date(row.due_at)<new Date()&&row.status!=='ready')

  const whatsapp=(r:OrderRow)=>{
    const p=phone(r.customer_phone)
    if(!p){
      setMessage('Nomor WhatsApp pelanggan tidak tersedia.')
      return
    }

    const trackingUrl=`${window.location.origin}/track/${encodeURIComponent(r.order_no)}`
    const baseText=settings.whatsapp_ready_template
      .replaceAll('{nama}',r.customer_name)
      .replaceAll('{order}',r.order_no)
      .replaceAll('{total}',rupiah(Number(r.total)))
      .replaceAll('{usaha}',settings.business_name)

    const text=`${baseText}\n\nCek status laundry:\n${trackingUrl}`
    window.open(`https://wa.me/${p}?text=${encodeURIComponent(text)}`,'_blank')
  }

  const move=async(r:OrderRow)=>{
    const n=next[r.status]
    if(!n)return

    setMessage('')
    setSuccess('')

    const{error}=await supabase
      .from('v100_orders')
      .update({status:n,updated_at:new Date().toISOString()})
      .eq('id',r.id)

    if(error){
      setMessage(error.message)
      return
    }

    setSuccess(
      n==='completed'
        ? `${r.order_no} selesai.`
        : `${r.order_no} dipindahkan ke ${statusLabels[n]}.`
    )

    await load()

    if(n==='ready'){
      whatsapp({...r,status:n})
    }

    if(n==='completed'){
      setScanOrder(null)
      highlightedRef.current=null
      setQuery('')
    }else{
      const updated={...r,status:n}
      setScanOrder(updated)
      highlightedRef.current=r.order_no
      setQuery(r.order_no)
      window.setTimeout(()=>{
        document
          .querySelector(`[data-production-order="${CSS.escape(r.order_no)}"]`)
          ?.scrollIntoView({behavior:'smooth',block:'center',inline:'center'})
      },180)
    }
  }

  const handleScannedValue=async(raw:string)=>{
    if(scanBusy)return
    setScanBusy(true)
    setMessage('')
    setSuccess('')

    await stopScanner()

    const orderNo=extractOrderNo(raw)
    if(!orderNo){
      setMessage('QR Nota tidak berisi nomor order yang valid.')
      setScanBusy(false)
      return
    }

    const found=rows.find(
      r=>r.order_no.toUpperCase()===orderNo.toUpperCase()
    )

    if(!found){
      // Refresh once in case a recent order has not reached this page yet.
      const{data,error}=await supabase
        .from('v100_orders_view')
        .select('*')
        .eq('order_no',orderNo)
        .maybeSingle()

      if(error){
        setMessage(error.message)
        setScanBusy(false)
        return
      }

      const refreshed=data as OrderRow|null
      if(!refreshed){
        setMessage(`Order ${orderNo} tidak ditemukan.`)
        setScanBusy(false)
        return
      }

      if(refreshed.status==='completed'||refreshed.status==='cancelled'){
        setMessage(`Order ${orderNo} sudah ${refreshed.status==='completed'?'selesai':'dibatalkan'} dan tidak ada di papan produksi aktif.`)
        setScanBusy(false)
        return
      }

      setScanOrder(refreshed)
      highlightedRef.current=refreshed.order_no
      setQuery(refreshed.order_no)
    }else{
      setScanOrder(found)
      highlightedRef.current=found.order_no
      setQuery(found.order_no)
    }

    setFilter('all')
    setScanOpen(false)
    setSuccess(`QR Nota berhasil dibaca: ${orderNo}`)
    setScanBusy(false)

    window.setTimeout(()=>{
      document
        .querySelector(`[data-production-order="${CSS.escape(orderNo)}"]`)
        ?.scrollIntoView({behavior:'smooth',block:'center',inline:'center'})
    },220)
  }

  const startScanner=async()=>{
    setMessage('')
    setSuccess('')
    setScanOrder(null)
    highlightedRef.current=null
    setScanOpen(true)

    window.setTimeout(async()=>{
      try{
        const scanner=new Html5Qrcode('production-qr-reader')
        scannerRef.current=scanner
        setScanning(true)

        await scanner.start(
          {facingMode:'environment'},
          {fps:10,qrbox:{width:250,height:250}},
          decodedText=>void handleScannedValue(decodedText),
          ()=>{}
        )
      }catch(error){
        setScanning(false)
        const text=error instanceof Error?error.message:String(error||'')
        setMessage(
          /permission|notallowed|denied/i.test(text)
            ? 'Izin kamera ditolak. Izinkan Camera untuk HappyLaundry lalu coba lagi.'
            : 'Kamera tidak dapat dibuka. Pastikan izin kamera aktif dan halaman menggunakan HTTPS.'
        )
      }
    },80)
  }

  const closeScanner=async()=>{
    await stopScanner()
    setScanOpen(false)
  }

  return <>
    <PageHeader
      eyebrow="PRODUKSI STABLE"
      title="Papan Proses Cucian"
      description="Cari atau scan QR nota untuk menemukan order dan memperbarui tahap proses dengan cepat."
      action={<div className="production-tools">
        <button
          type="button"
          className="primary-button production-qr-button"
          onClick={()=>void startScanner()}
        >
          <QrCode size={17}/>Scan QR Nota
        </button>

        <select
          value={filter}
          onChange={e=>setFilter(e.target.value as 'all'|'overdue')}
          aria-label="Filter produksi"
        >
          <option value="all">Semua order aktif</option>
          <option value="overdue">Terlambat saja</option>
        </select>

        <label className="search-box production-search">
          <Search size={18}/>
          <input
            value={query}
            onChange={e=>{
              setQuery(e.target.value)
              setScanOrder(null)
              highlightedRef.current=null
            }}
            placeholder="Cari order, nama, atau WhatsApp"
          />
        </label>
      </div>}
    />

    {message&&<div className="error-box inline-message">{message}</div>}
    {success&&<div className="success-box production-inline-success"><CheckCircle2 size={17}/>{success}</div>}

    {scanOrder&&<section className="panel production-scan-result">
      <div className="production-scan-result-icon"><QrCode size={24}/></div>
      <div className="production-scan-result-main">
        <span>ORDER DARI QR NOTA</span>
        <h3>{scanOrder.order_no}</h3>
        <p>{scanOrder.customer_name} • {scanOrder.customer_phone||'-'}</p>
      </div>
      <div className="production-scan-status">
        <span>Proses Sekarang</span>
        <b>{statusLabels[scanOrder.status]}</b>
      </div>
      <button
        type="button"
        className="primary-button production-scan-next"
        onClick={()=>void move(scanOrder)}
      >
        {scanOrder.status==='ready'?'Selesaikan Order':'Tahap Berikutnya'}
        <ChevronRight size={18}/>
      </button>
      <button
        type="button"
        className="icon-button production-scan-clear"
        title="Tutup hasil scan"
        onClick={()=>{
          setScanOrder(null)
          highlightedRef.current=null
          setQuery('')
          setSuccess('')
        }}
      >
        <X size={18}/>
      </button>
    </section>}

    <div className="production-board">
      {columns.map(s=>{
        const list=filtered.filter(r=>r.status===s)

        return <section className={`production-column production-${s}`} key={s}>
          <header>
            <div>
              <span className={`status-dot status-${s}`}/>
              <b>{statusLabels[s]}</b>
            </div>
            <span>{list.length}</span>
          </header>

          <div className="production-cards">
            {list.map(r=><article
              className={`production-card ${isOverdue(r)?'production-overdue':''} ${scanOrder?.id===r.id?'production-card-scanned':''}`}
              key={r.id}
              data-production-order={r.order_no}
            >
              <div className="production-card-head">
                <div>
                  <b>{r.order_no}</b>
                  <small>{r.customer_name}</small>
                </div>
                <span className={`badge payment-${r.payment_status}`}>
                  {r.payment_status==='paid'?'Lunas':r.payment_status==='partial'?'DP':'Belum Bayar'}
                </span>
              </div>

              <small>WA: {r.customer_phone||'-'}</small>

              {r.due_at&&<small className={isOverdue(r)?'overdue-text':''}>
                {isOverdue(r)?'⚠ Terlambat: ':'Estimasi: '}
                {new Date(r.due_at).toLocaleString('id-ID')}
              </small>}

              <div className="production-card-actions">
                <button className="whatsapp-button" onClick={()=>whatsapp(r)}>
                  <MessageCircle size={15}/>Kirim Update WA
                </button>
                <button onClick={()=>void move(r)}>
                  {s==='ready'?'Selesaikan':'Tahap Berikutnya'}
                  <ChevronRight size={15}/>
                </button>
              </div>
            </article>)}

            {list.length===0&&
              <div className="production-empty">
                <WashingMachine size={24}/>Kosong
              </div>}
          </div>
        </section>
      })}
    </div>

    {scanOpen&&<div className="production-scanner-backdrop" role="dialog" aria-modal="true">
      <section className="production-scanner-modal">
        <header>
          <div>
            <QrCode size={20}/>
            <span><b>Scan QR Nota</b><small>Arahkan kamera ke QR tracking pada nota pelanggan.</small></span>
          </div>
          <button type="button" className="icon-button" onClick={()=>void closeScanner()}><X size={20}/></button>
        </header>

        <div id="production-qr-reader" className="production-qr-reader"/>

        {!scanning&&<div className="production-scanner-wait">
          <Camera size={32}/>
          <span>{scanBusy?'Mencari order...':'Membuka kamera...'}</span>
        </div>}

        <div className="production-scanner-help">
          <QrCode size={18}/>
          <span>QR yang digunakan adalah QR pada nota HappyLaundry yang menuju halaman Tracking Order.</span>
        </div>

        <button type="button" className="secondary-button" onClick={()=>void closeScanner()}>
          <StopCircle size={16}/>Batalkan Scan
        </button>
      </section>
    </div>}
  </>
}
