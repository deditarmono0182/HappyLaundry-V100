import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera, CheckCircle2, CreditCard, ExternalLink, Eye, MessageCircle, Printer,
  QrCode, RefreshCw, Search, StopCircle, WashingMachine
} from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { formatIDR } from '../lib/format'
import { paymentLabels, statusLabels } from '../lib/order'
import { supabase } from '../lib/supabase'
import type { OrderRow } from '../types/order'

function extractOrderNo(value:string){
  const trimmed=value.trim()
  if(!trimmed)return ''
  try{
    const url=new URL(trimmed,window.location.origin)
    const match=url.pathname.match(/\/track\/([^/?#]+)/i)
    if(match?.[1])return decodeURIComponent(match[1]).trim().toUpperCase()
  }catch{}
  const match=trimmed.match(/HL-[A-Z0-9-]+/i)
  return (match?.[0]||trimmed).trim().toUpperCase()
}

export function QRScannerPage(){
  const navigate=useNavigate()
  const scannerRef=useRef<Html5Qrcode|null>(null)
  const scanLockedRef=useRef(false)

  const [manual,setManual]=useState('')
  const [scanning,setScanning]=useState(false)
  const [supported,setSupported]=useState(true)
  const [message,setMessage]=useState('')
  const [loading,setLoading]=useState(false)
  const [order,setOrder]=useState<OrderRow|null>(null)
  const [cameraName,setCameraName]=useState('')
  const [cameras,setCameras]=useState<Array<{id:string;label:string}>>([])
  const [selectedCameraId,setSelectedCameraId]=useState('')
  const [cameraState,setCameraState]=useState<'idle'|'requesting'|'ready'|'error'>('idle')

  const stopCamera=useCallback(async()=>{
    scanLockedRef.current=false
    const scanner=scannerRef.current
    if(scanner){
      try{if(scanner.isScanning)await scanner.stop()}catch{}
      try{await scanner.clear()}catch{}
      scannerRef.current=null
    }
    setScanning(false)
    setCameraState('idle')
    setCameraName('')
  },[])

  const findOrder=async(value:string)=>{
    const orderNo=extractOrderNo(value)
    if(!orderNo){
      setMessage('Nomor order tidak dikenali.')
      setOrder(null)
      return
    }

    await stopCamera()
    setLoading(true)
    setMessage('')
    setOrder(null)
    setManual(orderNo)

    const {data,error}=await supabase.rpc('v110_qr_find_order',{
      p_order_no:orderNo
    })

    if(error){
      const text=error.message||''
      if(/permission|not allowed|akses/i.test(text)){
        setMessage('Akun ini tidak memiliki akses QR Center.')
      }else{
        setMessage('Order tidak dapat dibuka. Coba ulangi atau hubungi Owner.')
      }
    }else{
      const row=(Array.isArray(data)?data[0]:data) as OrderRow|undefined|null
      if(!row)setMessage(`Order ${orderNo} tidak ditemukan di aplikasi.`)
      else setOrder(row)
    }

    setLoading(false)
  }

  const startCamera=async(preferredCameraId?:string)=>{
    setMessage('')
    setOrder(null)
    setSupported(true)
    setCameraState('requesting')
    scanLockedRef.current=false

    if(!window.isSecureContext){
      setCameraState('error');setSupported(false)
      setMessage('Kamera membutuhkan koneksi HTTPS.')
      return
    }
    if(!navigator.mediaDevices?.getUserMedia){
      setCameraState('error');setSupported(false)
      setMessage('Browser ini tidak mendukung kamera web. Gunakan Chrome terbaru atau pencarian manual.')
      return
    }

    try{
      await stopCamera()
      setCameraState('requesting')

      // Android Chrome/Samsung tablet is more reliable when permission is
      // requested directly through getUserMedia before html5-qrcode enumerates devices.
      let permissionStream:MediaStream|null=null
      try{
        permissionStream=await navigator.mediaDevices.getUserMedia({
          audio:false,
          video:{facingMode:{ideal:'environment'}}
        })
      }catch(permissionError){
        const err=permissionError as {name?:string;message?:string}
        const detail=`${err?.name||''} ${err?.message||String(permissionError||'')}`
        setCameraState('error')
        if(/NotAllowedError|PermissionDenied|permission|denied|not allowed/i.test(detail)){
          setMessage('Chrome belum mengizinkan kamera untuk HappyLaundry. Buka izin situs Camera = Allow, lalu tekan Coba Lagi.')
        }else if(/NotFoundError|DevicesNotFound|not found/i.test(detail)){
          setMessage('Kamera tidak ditemukan pada tablet ini.')
        }else if(/NotReadableError|TrackStartError|in use/i.test(detail)){
          setMessage('Kamera sedang dipakai aplikasi lain. Tutup aplikasi Kamera/Video Call lalu coba lagi.')
        }else{
          setMessage(`Kamera belum dapat dibuka: ${detail}`)
        }
        return
      }finally{
        // Release the permission probe before html5-qrcode opens the real stream.
        permissionStream?.getTracks().forEach(track=>track.stop())
      }

      let available:Array<{id:string;label:string}>=[]
      try{
        available=await Html5Qrcode.getCameras()
      }catch{}
      setCameras(available)

      const preferred=preferredCameraId||selectedCameraId
      const chosen=
        available.find(camera=>camera.id===preferred)||
        available.find(camera=>/back|rear|environment|belakang|0,\s*facing back/i.test(camera.label))||
        available[available.length-1]

      if(chosen){
        setSelectedCameraId(chosen.id)
        setCameraName(chosen.label||'Kamera belakang')
      }else{
        setCameraName('Kamera belakang')
      }

      const scanner=new Html5Qrcode('qr-center-reader',{verbose:false})
      scannerRef.current=scanner

      setScanning(true)
      setCameraState('ready')

      // Use plain device id when known. Some Android Chromium builds reject
      // MediaTrackConstraints {deviceId:{exact:...}} passed through html5-qrcode.
      const cameraConfig:string|MediaTrackConstraints=
        chosen?.id ? chosen.id : {facingMode:'environment'}

      await scanner.start(
        cameraConfig,
        {
          fps:12,
          qrbox:(viewWidth:number,viewHeight:number)=>{
            const edge=Math.max(180,Math.min(300,Math.floor(Math.min(viewWidth,viewHeight)*0.72)))
            return {width:edge,height:edge}
          },
          aspectRatio:1
        },
        decodedText=>{
          if(scanLockedRef.current)return
          scanLockedRef.current=true
          void findOrder(decodedText)
        },
        ()=>{}
      )
    }catch(error){
      setScanning(false);setCameraState('error')
      const err=error as {name?:string;message?:string}
      const detail=`${err?.name||''} ${err?.message||String(error||'')}`
      if(/NotAllowedError|PermissionDenied|permission|denied|not allowed/i.test(detail)){
        setMessage('Izin kamera ditolak oleh Chrome. Pastikan Camera = Allow, lalu tekan Coba Lagi.')
      }else if(/NotReadableError|TrackStartError|Could not start|in use/i.test(detail)){
        setMessage('Kamera tidak bisa dipakai. Tutup aplikasi lain yang memakai kamera, lalu tekan Coba Lagi.')
      }else if(/Overconstrained|constraint/i.test(detail)){
        setMessage('Kamera yang dipilih tidak kompatibel. Pilih kamera lain lalu coba lagi.')
      }else{
        setMessage(`Scanner gagal membuka kamera: ${detail}. Coba pilih kamera lain atau gunakan pencarian manual.`)
      }
      try{
        if(scannerRef.current?.isScanning)await scannerRef.current.stop()
        await scannerRef.current?.clear()
      }catch{}
      scannerRef.current=null
    }
  }


  useEffect(()=>()=>{void stopCamera()},[stopCamera])

  const submit=(event:FormEvent)=>{
    event.preventDefault()
    void findOrder(manual)
  }

  const remaining=order?Math.max(0,Number(order.total)-Number(order.paid_amount)):0

  const openWhatsApp=()=>{
    if(!order?.customer_phone)return
    const phone=order.customer_phone.replace(/\D/g,'').replace(/^0/,'62')
    const message=`Halo ${order.customer_name}, informasi order ${order.order_no}. Status: ${statusLabels[order.status]}. Total: ${formatIDR(Number(order.total))}.`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,'_blank')
  }

  const printReceipt=()=>{
    if(!order)return
    const w=window.open('','_blank','width=420,height=700')
    if(!w)return
    w.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${order.order_no}</title>
<style>
body{font-family:Arial,sans-serif;width:58mm;margin:0 auto;padding:4mm;color:#111}
h2,p{margin:0 0 5px;text-align:center}.line{border-top:1px dashed #111;margin:8px 0}
.row{display:flex;justify-content:space-between;gap:10px;font-size:12px;margin:4px 0}
.strong{font-weight:700}.small{font-size:11px}.qr{text-align:center;margin-top:12px}
</style></head><body>
<h2>HappyLaundry</h2><p class="small">Babakan, Cirebon</p><div class="line"></div>
<div class="row"><span>No. Order</span><b>${order.order_no}</b></div>
<div class="row"><span>Pelanggan</span><b>${order.customer_name}</b></div>
<div class="row"><span>Status</span><span>${statusLabels[order.status]}</span></div>
<div class="line"></div>
<div class="row strong"><span>Total</span><span>${formatIDR(Number(order.total))}</span></div>
<div class="row"><span>Sudah Bayar</span><span>${formatIDR(Number(order.paid_amount))}</span></div>
<div class="row"><span>Sisa</span><span>${formatIDR(remaining)}</span></div>
<div class="line"></div>
<p class="small">Tracking: ${window.location.origin}/track/${encodeURIComponent(order.order_no)}</p>
<p class="small">Terima kasih telah menggunakan HappyLaundry.</p>
<script>window.onload=()=>window.print()</script>
</body></html>`)
    w.document.close()
  }

  return <>
    <PageHeader
      eyebrow="ENTERPRISE QR CENTER"
      title="QR Center"
      description="Scan QR yang sama dari nota pelanggan untuk membuka order di aplikasi; pelanggan memakai QR itu untuk tracking."
    />

    <section className="qr-center-grid">
      <article className="panel qr-camera-card">
        <div className="qr-camera-head">
          <div><QrCode size={24}/><div><h2>Scan QR Nota</h2><p>Arahkan kamera ke QR pada nota HappyLaundry.</p></div></div>
          {scanning
            ? <button className="secondary-button" onClick={()=>void stopCamera()}><StopCircle size={17}/>Stop Kamera</button>
            : <button className="primary-button" onClick={()=>void startCamera(undefined)}>
                {cameraState==='error'?<RefreshCw size={17}/>:<Camera size={17}/>}
                {cameraState==='requesting'?'Meminta Kamera...':cameraState==='error'?'Coba Lagi':'Mulai Scan'}
              </button>}
        </div>

        <div className={`qr-camera-box qr-html5-camera ${scanning?'active':''}`}>
          <div id="qr-center-reader" className="qr-center-reader"/>
          {!scanning&&cameraState!=='requesting'&&<div className="qr-camera-placeholder">
            <QrCode size={58}/><b>Scanner QR</b><span>Tekan Mulai Scan untuk membuka kamera belakang tablet.</span>
          </div>}
          {cameraState==='requesting'&&<div className="qr-camera-placeholder qr-camera-requesting">
            <Camera size={52}/><b>Meminta akses kamera…</b><span>Jika Chrome meminta izin, pilih Allow / Izinkan.</span>
          </div>}
          {scanning&&<div className="qr-target"><i/><i/><i/><i/></div>}
        </div>
        {scanning&&<div className="qr-camera-status success"><CheckCircle2 size={16}/><span>Kamera aktif{cameraName?` • ${cameraName}`:''}. Arahkan QR nota ke kotak scanner.</span></div>}
        {cameras.length>1&&<div className="qr-camera-selector">
          <label>
            <span>Pilih Kamera</span>
            <select value={selectedCameraId} onChange={e=>{
              const id=e.target.value
              setSelectedCameraId(id)
              void startCamera(id)
            }}>
              {cameras.map((camera,index)=><option key={camera.id} value={camera.id}>{camera.label||`Kamera ${index+1}`}</option>)}
            </select>
          </label>
          <small>Jika QR tidak terbaca, pilih kamera belakang/rear.</small>
        </div>}
        {!supported&&<div className="qr-browser-note"><b>Scanner kamera tidak tersedia:</b><span>Gunakan Chrome terbaru atau pencarian nomor order manual.</span></div>}
      </article>

      <article className="panel qr-manual-card qr-search-order">
        <h2>Cari Order</h2>
        <p>Masukkan nomor order. Hasilnya dibuka di QR Center, bukan ke tracking pelanggan.</p>
        <form onSubmit={submit}>
          <label className="search-box">
            <Search size={19}/>
            <input
              value={manual}
              onChange={e=>setManual(e.target.value)}
              placeholder="Contoh: HL-260806-00005"
            />
          </label>
          <button className="primary-button" disabled={loading}>
            <Search size={17}/>{loading?'Mencari...':'Cari Order'}
          </button>
        </form>

        {message&&<div className="qr-info-box">{message}</div>}

        <div className="qr-help">
          <b>QR pelanggan & kasir</b>
          <small>Setelah order ditemukan, kasir dapat langsung menerima pembayaran, melihat detail, mencetak nota, membuka produksi, atau menghubungi pelanggan.</small>
        </div>
      </article>
    </section>

    {order&&<section className="panel qr-order-result">
      <div className="qr-order-title">
        <div>
          <span>ORDER DITEMUKAN</span>
          <h2>{order.order_no}</h2>
          <p>{order.customer_name} • {order.customer_phone||'-'}</p>
        </div>
        <div className="qr-order-badges">
          <span className={`badge status-${order.status}`}>{statusLabels[order.status]}</span>
          <span className={`badge payment-${order.payment_status}`}>{paymentLabels[order.payment_status]}</span>
        </div>
      </div>

      <div className="qr-order-summary">
        <div><span>Total</span><b>{formatIDR(Number(order.total))}</b></div>
        <div><span>Sudah Bayar</span><b>{formatIDR(Number(order.paid_amount))}</b></div>
        <div className={remaining>0?'has-balance':''}><span>Sisa Tagihan</span><b>{formatIDR(remaining)}</b></div>
        <div><span>Estimasi</span><b>{order.due_at?new Date(order.due_at).toLocaleString('id-ID'):'-'}</b></div>
      </div>

      <div className="qr-center-actions">
        {remaining>0
          ? <button className="qr-action-primary" onClick={()=>navigate(`/payments?order=${encodeURIComponent(order.order_no)}`)}><CreditCard size={19}/>Bayar Sekarang</button>
          : <button className="qr-action-paid" disabled><CreditCard size={19}/>Sudah Lunas</button>}
        <button onClick={()=>navigate(`/orders?order=${encodeURIComponent(order.order_no)}`)}><Eye size={18}/>Detail Order</button>
        <button onClick={()=>navigate(`/production?order=${encodeURIComponent(order.order_no)}`)}><WashingMachine size={18}/>Produksi</button>
        <button onClick={printReceipt}><Printer size={18}/>Cetak Nota</button>
        <button onClick={openWhatsApp}><MessageCircle size={18}/>WhatsApp</button>
        <button onClick={()=>window.open(`/track/${encodeURIComponent(order.order_no)}`,'_blank')}><ExternalLink size={18}/>Tracking Pelanggan</button>
      </div>
    </section>}
  </>
}
