import { FormEvent, useEffect, useRef, useState } from 'react'
import {
  Camera, CreditCard, ExternalLink, Eye, MessageCircle, Printer,
  QrCode, Search, StopCircle, WashingMachine
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { formatIDR } from '../lib/format'
import { paymentLabels, statusLabels } from '../lib/order'
import { supabase } from '../lib/supabase'
import type { OrderRow } from '../types/order'

type DetectorLike={
  detect:(source:CanvasImageSource)=>Promise<Array<{rawValue:string}>>
}

declare global{
  interface Window{
    BarcodeDetector?:new(options?:{formats?:string[]})=>DetectorLike
  }
}

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
  const videoRef=useRef<HTMLVideoElement|null>(null)
  const streamRef=useRef<MediaStream|null>(null)
  const frameRef=useRef<number|undefined>(undefined)
  const detectorRef=useRef<DetectorLike|null>(null)

  const [manual,setManual]=useState('')
  const [scanning,setScanning]=useState(false)
  const [supported,setSupported]=useState(true)
  const [message,setMessage]=useState('')
  const [loading,setLoading]=useState(false)
  const [order,setOrder]=useState<OrderRow|null>(null)

  const stopCamera=()=>{
    if(frameRef.current)cancelAnimationFrame(frameRef.current)
    frameRef.current=undefined
    streamRef.current?.getTracks().forEach(track=>track.stop())
    streamRef.current=null
    if(videoRef.current)videoRef.current.srcObject=null
    setScanning(false)
  }

  const findOrder=async(value:string)=>{
    const orderNo=extractOrderNo(value)
    if(!orderNo){
      setMessage('Nomor order tidak dikenali.')
      setOrder(null)
      return
    }

    stopCamera()
    setLoading(true)
    setMessage('')
    setOrder(null)
    setManual(orderNo)

    const {data,error}=await supabase
      .from('v100_orders_view')
      .select('*')
      .eq('order_no',orderNo)
      .maybeSingle()

    if(error)setMessage(error.message)
    else if(!data)setMessage(`Order ${orderNo} tidak ditemukan di aplikasi.`)
    else setOrder(data as OrderRow)

    setLoading(false)
  }

  const scanFrame=async()=>{
    if(!scanning||!videoRef.current||!detectorRef.current)return
    try{
      const codes=await detectorRef.current.detect(videoRef.current)
      const found=codes.find(code=>code.rawValue)
      if(found?.rawValue){
        void findOrder(found.rawValue)
        return
      }
    }catch{}
    frameRef.current=requestAnimationFrame(scanFrame)
  }

  const startCamera=async()=>{
    setMessage('')
    setOrder(null)

    if(!('mediaDevices' in navigator)||!navigator.mediaDevices.getUserMedia){
      setSupported(false)
      setMessage('Browser ini tidak mendukung akses kamera. Gunakan pencarian manual.')
      return
    }

    if(!window.BarcodeDetector){
      setSupported(false)
      setMessage('Scan QR langsung belum didukung browser ini. Gunakan pencarian manual atau kamera bawaan HP.')
      return
    }

    try{
      detectorRef.current=new window.BarcodeDetector({formats:['qr_code']})
      const stream=await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:'environment'}},
        audio:false
      })
      streamRef.current=stream
      if(videoRef.current){
        videoRef.current.srcObject=stream
        await videoRef.current.play()
      }
      setScanning(true)
      frameRef.current=requestAnimationFrame(scanFrame)
    }catch(error){
      setMessage(error instanceof Error?error.message:'Kamera tidak dapat dibuka.')
      setScanning(false)
    }
  }

  useEffect(()=>()=>stopCamera(),[])

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
            ? <button className="secondary-button" onClick={stopCamera}><StopCircle size={17}/>Stop Kamera</button>
            : <button className="primary-button" onClick={()=>void startCamera()}><Camera size={17}/>Mulai Scan</button>}
        </div>

        <div className={`qr-camera-box ${scanning?'active':''}`}>
          <video ref={videoRef} playsInline muted/>
          {!scanning&&<div className="qr-camera-placeholder">
            <QrCode size={58}/>
            <b>Scanner QR</b>
            <span>Scan QR untuk mencari order langsung di aplikasi.</span>
          </div>}
          {scanning&&<div className="qr-target"><i/><i/><i/><i/></div>}
        </div>

        {!supported&&<div className="qr-browser-note">
          <b>Untuk iPhone:</b>
          <span>Jika scan langsung tidak tersedia, gunakan pencarian manual di sebelah atau kamera iPhone.</span>
        </div>}
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
