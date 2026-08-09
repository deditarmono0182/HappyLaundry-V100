import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera, CheckCircle2, CreditCard, ExternalLink, Eye, ImageUp, MessageCircle, Printer,
  QrCode, RefreshCw, Search, StopCircle, WashingMachine
} from 'lucide-react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
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
  const [cameraDiagnostics,setCameraDiagnostics]=useState<string[]>([])
  const [scanFileBusy,setScanFileBusy]=useState(false)

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
    if(!orderNo){setMessage('Nomor order tidak dikenali.');setOrder(null);scanLockedRef.current=false;return}
    await stopCamera();setLoading(true);setMessage('');setOrder(null);setManual(orderNo)
    try{
      const {data:direct,error}=await supabase.from('v100_orders')
        .select('id,order_no,customer_id,status,payment_status,total,paid_amount,created_at')
        .eq('order_no',orderNo).maybeSingle()
      if(error)throw error
      if(!direct){setMessage(`Order ${orderNo} tidak ditemukan di aplikasi.`);return}
      let customer_name='Pelanggan',customer_phone=''
      if(direct.customer_id){
        const {data:c}=await supabase.from('v100_customers').select('name,phone').eq('id',direct.customer_id).maybeSingle()
        if(c){customer_name=c.name||customer_name;customer_phone=c.phone||''}
      }
      setOrder({...direct,customer_name,customer_phone} as OrderRow)
    }catch(error){
      setMessage(`Database gagal membuka ${orderNo}: ${error instanceof Error?error.message:String(error)}`)
    }finally{setLoading(false);scanLockedRef.current=false}
  }

  const addCameraDiagnostic=(text:string)=>setCameraDiagnostics(current=>[...current.slice(-7),text])

  const startCamera=async(preferredCameraId?:string)=>{
    setMessage('');setOrder(null);setSupported(true);setCameraState('requesting');setCameraDiagnostics([]);scanLockedRef.current=false
    if(!window.isSecureContext){setCameraState('error');setSupported(false);setMessage('Kamera membutuhkan HTTPS.');return}
    if(!navigator.mediaDevices?.getUserMedia){setCameraState('error');setSupported(false);setMessage('Browser ini tidak menyediakan akses kamera web.');return}
    try{
      await stopCamera();addCameraDiagnostic('Meminta izin kamera...')
      let probe:MediaStream|null=null
      try{probe=await navigator.mediaDevices.getUserMedia({video:true,audio:false});addCameraDiagnostic('Izin kamera berhasil.')}
      catch(error){const d=error instanceof Error?`${error.name}: ${error.message}`:String(error);addCameraDiagnostic(d);setCameraState('error');setMessage(/NotAllowed|denied|permission/i.test(d)?'Izin kamera ditolak. Aktifkan Camera = Allow.':`Kamera tidak dapat diakses: ${d}`);return}
      finally{probe?.getTracks().forEach(x=>x.stop())}

      let available:Array<{id:string;label:string}>=[]
      try{available=await Html5Qrcode.getCameras();setCameras(available);addCameraDiagnostic(`${available.length} kamera terdeteksi.`)}catch(e){addCameraDiagnostic(`Daftar kamera gagal: ${String(e)}`)}
      const scanner=new Html5Qrcode('qr-center-reader',{
        verbose:false,
        formatsToSupport:[
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_128
        ]
      });scannerRef.current=scanner
      const preferred=preferredCameraId||selectedCameraId
      const candidates:Array<{config:string|MediaTrackConstraints;label:string;id?:string}>=[]
      if(preferred){const c=available.find(x=>x.id===preferred);candidates.push({config:preferred,label:c?.label||'Kamera pilihan',id:preferred})}
      candidates.push({config:{facingMode:'environment'},label:'Kamera belakang'})
      for(const c of available.filter(x=>/back|rear|environment|belakang/i.test(x.label)))if(!candidates.some(x=>x.id===c.id))candidates.push({config:c.id,label:c.label||'Kamera belakang',id:c.id})
      for(const c of available)if(!candidates.some(x=>x.id===c.id))candidates.push({config:c.id,label:c.label||'Kamera',id:c.id})
      let last:unknown=null
      for(const candidate of candidates){
        try{
          addCameraDiagnostic(`Mencoba ${candidate.label}...`)
          await scanner.start(candidate.config,{fps:10,qrbox:(w:number,h:number)=>{const e=Math.max(170,Math.min(280,Math.floor(Math.min(w,h)*.68)));return{width:e,height:e}}},
            decoded=>{if(scanLockedRef.current)return;scanLockedRef.current=true;void findOrder(decoded)},()=>{})
          setScanning(true);setCameraState('ready');setCameraName(candidate.label);if(candidate.id)setSelectedCameraId(candidate.id);addCameraDiagnostic(`${candidate.label} aktif.`);return
        }catch(e){last=e;addCameraDiagnostic(`${candidate.label} gagal: ${String(e)}`);try{if(scanner.isScanning)await scanner.stop()}catch{}}
      }
      throw last||new Error('Semua kamera gagal dibuka.')
    }catch(error){
      setScanning(false);setCameraState('error');setMessage(`Kamera live gagal. Gunakan Scan dari Foto/Galeri. ${error instanceof Error?error.message:String(error)}`)
      try{if(scannerRef.current?.isScanning)await scannerRef.current.stop();await scannerRef.current?.clear()}catch{};scannerRef.current=null
    }
  }

  const scanFromFile=async(file:File|null)=>{
    if(!file)return
    setScanFileBusy(true);setMessage('');setOrder(null)
    try{await stopCamera();const scanner=new Html5Qrcode('qr-center-reader',{
        verbose:false,
        formatsToSupport:[
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_128
        ]
      });scannerRef.current=scanner;const decoded=await scanner.scanFile(file,true);await findOrder(decoded)}
    catch(error){setMessage(`QR tidak terbaca dari foto. Pastikan QR terlihat jelas. ${error instanceof Error?error.message:String(error)}`)}
    finally{try{await scannerRef.current?.clear()}catch{};scannerRef.current=null;setScanFileBusy(false)}
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
      title="QR & Barcode Center"
      description="Scan QR atau barcode pada nota untuk membuka order langsung di aplikasi."
    />

    <section className="qr-center-grid">
      <article className="panel qr-camera-card">
        <div className="qr-camera-head">
          <div><QrCode size={24}/><div><h2>Scan QR / Barcode Nota</h2><p>Arahkan kamera ke QR atau barcode Code 39 pada nota HappyLaundry.</p></div></div>
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
        {scanning&&<div className="qr-camera-status success"><CheckCircle2 size={16}/><span>Kamera aktif{cameraName?` • ${cameraName}`:''}. Arahkan QR atau barcode nota ke kotak scanner.</span></div>}
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
        <div className="qr-photo-fallback">
          <label className="secondary-button qr-photo-button"><ImageUp size={17}/>{scanFileBusy?'Membaca Foto...':'Scan dari Foto / Galeri'}
            <input type="file" accept="image/*" disabled={scanFileBusy} onChange={e=>{const file=e.target.files?.[0]||null;void scanFromFile(file);e.currentTarget.value=''}}/>
          </label>
          <small>Jika kamera live tablet gagal, foto QR nota lalu pilih fotonya.</small>
        </div>
        {cameraDiagnostics.length>0&&<details className="qr-camera-diagnostics"><summary>Diagnostik Kamera</summary><div>{cameraDiagnostics.map((line,index)=><code key={index}>{line}</code>)}</div></details>}
        {!supported&&<div className="qr-browser-note"><b>Scanner kamera tidak tersedia:</b><span>Gunakan Scan dari Foto/Galeri atau pencarian nomor order manual.</span></div>}
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
        <button onClick={()=>navigate(`/track/${encodeURIComponent(order.order_no)}?app=1&from=${encodeURIComponent('/qr-scan')}`)}><ExternalLink size={18}/>Tracking Pelanggan</button>
      </div>
    </section>}
  </>
}
