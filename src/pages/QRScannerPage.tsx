import { FormEvent, useEffect, useRef, useState } from 'react'
import { Camera, ExternalLink, QrCode, Search, StopCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'

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

  const stopCamera=()=>{
    if(frameRef.current)cancelAnimationFrame(frameRef.current)
    frameRef.current=undefined
    streamRef.current?.getTracks().forEach(track=>track.stop())
    streamRef.current=null
    if(videoRef.current)videoRef.current.srcObject=null
    setScanning(false)
  }

  const openValue=(value:string)=>{
    const orderNo=extractOrderNo(value)
    if(!orderNo){
      setMessage('QR tidak berisi nomor order yang dikenali.')
      return
    }
    stopCamera()
    navigate(`/track/${encodeURIComponent(orderNo)}`)
  }

  const scanFrame=async()=>{
    if(!scanning||!videoRef.current||!detectorRef.current)return
    try{
      const codes=await detectorRef.current.detect(videoRef.current)
      const found=codes.find(code=>code.rawValue)
      if(found?.rawValue){
        openValue(found.rawValue)
        return
      }
    }catch{}
    frameRef.current=requestAnimationFrame(scanFrame)
  }

  const startCamera=async()=>{
    setMessage('')
    if(!('mediaDevices' in navigator)||!navigator.mediaDevices.getUserMedia){
      setSupported(false)
      setMessage('Browser ini tidak mendukung akses kamera. Gunakan input nomor order di bawah.')
      return
    }

    if(!window.BarcodeDetector){
      setSupported(false)
      setMessage('Pemindaian QR langsung belum didukung browser ini. Gunakan nomor order atau buka QR dengan kamera bawaan HP.')
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
    openValue(manual)
  }

  return <>
    <PageHeader
      eyebrow="QR TOOLS"
      title="Scan QR Nota"
      description="Scan QR pada nota untuk membuka status order dengan cepat."
    />

    <section className="qr-scan-layout">
      <article className="panel qr-camera-card">
        <div className="qr-camera-head">
          <div><QrCode size={24}/><div><h2>Kamera QR</h2><p>Arahkan kamera ke QR pada nota HappyLaundry.</p></div></div>
          {scanning
            ? <button className="secondary-button" onClick={stopCamera}><StopCircle size={17}/>Stop Kamera</button>
            : <button className="primary-button" onClick={()=>void startCamera()}><Camera size={17}/>Mulai Scan</button>}
        </div>

        <div className={`qr-camera-box ${scanning?'active':''}`}>
          <video ref={videoRef} playsInline muted/>
          {!scanning&&<div className="qr-camera-placeholder">
            <QrCode size={58}/>
            <b>Scanner belum aktif</b>
            <span>Tekan “Mulai Scan” lalu izinkan akses kamera.</span>
          </div>}
          {scanning&&<div className="qr-target"><i/><i/><i/><i/></div>}
        </div>

        {message&&<div className="qr-info-box">{message}</div>}

        {!supported&&<div className="qr-browser-note">
          <b>Alternatif di iPhone:</b>
          <span>Buka aplikasi Kamera iPhone, arahkan ke QR nota, lalu ketuk link yang muncul.</span>
        </div>}
      </article>

      <article className="panel qr-manual-card">
        <h2>Cari Manual</h2>
        <p>Kalau kamera tidak mendukung scanner, masukkan nomor order.</p>
        <form onSubmit={submit}>
          <label className="search-box">
            <Search size={19}/>
            <input
              value={manual}
              onChange={e=>setManual(e.target.value)}
              placeholder="Contoh: HL-260806-00005"
            />
          </label>
          <button className="primary-button"><ExternalLink size={17}/>Buka Tracking</button>
        </form>

        <div className="qr-help">
          <b>QR pada nota akan membuka:</b>
          <code>happylaundrybabakancrb.com/track/NOMOR-ORDER</code>
          <small>Jadi tidak perlu mengetik nomor order jika QR dapat dipindai.</small>
        </div>
      </article>
    </section>
  </>
}
