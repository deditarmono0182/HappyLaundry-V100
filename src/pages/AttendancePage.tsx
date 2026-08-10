import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, LocateFixed, MapPin, QrCode, ScanLine, ShieldCheck, StopCircle } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

type AttendanceResult={
  ok?:boolean
  created?:boolean
  status?:string
  distance_meters?:number
  attendance_date?:string
  check_in_at?:string
  check_out_at?:string
  action?:'check_in'|'check_out'
  message?:string
}

const deviceLabel=()=>{
  const ua=navigator.userAgent||''
  if(/iPhone/i.test(ua))return 'iPhone'
  if(/iPad/i.test(ua))return 'iPad'
  if(/Android/i.test(ua))return 'Android'
  if(/Windows/i.test(ua))return 'Windows'
  if(/Macintosh/i.test(ua))return 'Mac'
  return 'Browser'
}

export function AttendancePage(){
  const{profile}=useAuth()
  const scannerRef=useRef<Html5Qrcode|null>(null)
  const[scanning,setScanning]=useState(false)
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const[result,setResult]=useState<AttendanceResult|null>(null)
  const[locationText,setLocationText]=useState('GPS belum diperiksa')
  const[attendanceState,setAttendanceState]=useState<{attendance_required?:boolean;attended_today?:boolean;checked_out?:boolean;work_start?:string;work_end?:string}|null>(null)

  const stopScanner=async()=>{
    const scanner=scannerRef.current
    if(scanner){
      try{
        if(scanner.isScanning)await scanner.stop()
        await scanner.clear()
      }catch{}
      scannerRef.current=null
    }
    setScanning(false)
  }

  useEffect(()=>()=>{void stopScanner()},[])

  useEffect(()=>{
    let active=true
    const loadState=async()=>{
      const{data}=await supabase.rpc('v11322_current_attendance_state')
      if(!active||!data)return
      const row=(Array.isArray(data)?data[0]:data) as typeof attendanceState
      setAttendanceState(row)
    }
    void loadState()
    return()=>{active=false}
  },[])

  const getLocation=()=>new Promise<GeolocationPosition>((resolve,reject)=>{
    if(!navigator.geolocation){
      reject(new Error('GPS tidak tersedia di perangkat ini.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {enableHighAccuracy:true,timeout:15000,maximumAge:0}
    )
  })

  const submitAttendance=async(rawQr:string)=>{
    setBusy(true);setMessage('');setResult(null)
    await stopScanner()

    const token=rawQr.trim().replace(/^HL-ATT:/i,'').trim()
    if(!token){
      setMessage('QR Absen tidak valid.')
      setBusy(false)
      return
    }

    setLocationText('Memeriksa GPS...')
    let pos:GeolocationPosition
    try{
      pos=await getLocation()
    }catch(error){
      setLocationText('GPS gagal')
      const text=error instanceof GeolocationPositionError
        ? error.code===1?'Izin lokasi/GPS ditolak. Aktifkan Location untuk HappyLaundry.':'Lokasi GPS tidak dapat dibaca.'
        : error instanceof Error?error.message:'GPS gagal dibaca.'
      setMessage(text)
      setBusy(false)
      return
    }

    setLocationText(`GPS akurasi ±${Math.round(pos.coords.accuracy)} m`)

    const{data,error}=await supabase.rpc('v112_record_qr_gps_attendance',{
      p_qr_token:token,
      p_latitude:pos.coords.latitude,
      p_longitude:pos.coords.longitude,
      p_accuracy_meters:pos.coords.accuracy,
      p_device:deviceLabel()
    })

    if(error){
      setMessage(error.message)
      setBusy(false)
      return
    }

    const row=(Array.isArray(data)?data[0]:data) as AttendanceResult|null
    if(row?.ok){
      setResult(row)
      const{data:state}=await supabase.rpc('v11322_current_attendance_state')
      if(state)setAttendanceState((Array.isArray(state)?state[0]:state) as typeof attendanceState)
      window.dispatchEvent(new Event('happylaundry-attendance-changed'))
    }else{
      setMessage(row?.message||'Absensi tidak berhasil.')
    }
    setBusy(false)
  }

  const startScanner=async()=>{
    setMessage('');setResult(null)
    try{
      const scanner=new Html5Qrcode('employee-attendance-reader')
      scannerRef.current=scanner
      setScanning(true)
      await scanner.start(
        {facingMode:'environment'},
        {fps:10,qrbox:{width:240,height:240}},
        decodedText=>void submitAttendance(decodedText),
        ()=>{}
      )
    }catch(error){
      setScanning(false)
      const text=error instanceof Error?error.message:String(error||'')
      setMessage(
        /permission|notallowed|denied/i.test(text)
          ? 'Izin kamera ditolak. Izinkan Camera untuk HappyLaundry lalu coba lagi.'
          : 'Kamera tidak dapat dibuka. Pastikan izin kamera aktif.'
      )
    }
  }

  if(profile?.role!=='employee'){
    return <div className="error-box">Menu Absen digunakan untuk akun karyawan.</div>
  }

  if(attendanceState?.attendance_required===false){
    return <section className="panel attendance-exempt-card">
      <ShieldCheck size={32}/>
      <div><b>Bebas Absensi</b><span>Owner menetapkan akun ini tidak wajib QR/GPS dan tidak dibatasi jam kerja.</span></div>
    </section>
  }

  return <>
    <PageHeader
      eyebrow="SMART ATTENDANCE"
      title={attendanceState?.attended_today&&!attendanceState?.checked_out?"Absen Pulang":"Absen Karyawan"}
      description={attendanceState?.attended_today&&!attendanceState?.checked_out?"Scan QR toko + GPS untuk mencatat jam pulang.":"Scan QR toko + GPS untuk mencatat kehadiran hari ini."}
    />

    <section className="attendance-employee-grid">
      <article className="panel attendance-scan-card">
        <div className="attendance-scan-heading">
          <div className="attendance-scan-icon"><ScanLine size={28}/></div>
          <div>
            <h2>{attendanceState?.attended_today&&!attendanceState?.checked_out?'Scan QR Absen Pulang':'Scan QR Absen Masuk'}</h2>
            <p>Pastikan Anda berada di area HappyLaundry dan Location/GPS aktif.</p>
          </div>
        </div>

        <div id="employee-attendance-reader" className={`attendance-reader ${scanning?'active':''}`}/>

        {!scanning&&!result&&<div className="attendance-scan-placeholder">
          <QrCode size={68}/>
          <b>QR Absen Toko</b>
          <span>QR tracking pelanggan tidak dapat digunakan untuk absensi.</span>
        </div>}

        <div className="attendance-scan-actions">
          {!scanning
            ? <button className="primary-button attendance-big-button" disabled={busy} onClick={()=>void startScanner()}><ScanLine size={20}/>{busy?'Memeriksa...':attendanceState?.attended_today&&!attendanceState?.checked_out?'SCAN QR ABSEN PULANG':'SCAN QR ABSEN MASUK'}</button>
            : <button className="secondary-button" onClick={()=>void stopScanner()}><StopCircle size={17}/>Batalkan Scan</button>}
        </div>

        {message&&<div className="error-box attendance-message">{message}</div>}
      </article>

      <aside className="panel attendance-verification-card">
        <h3>Verifikasi Kehadiran</h3>
        <div><ShieldCheck size={19}/><span><b>Login Karyawan</b><small>{profile.full_name} • {profile.login_id}</small></span></div>
        <div><QrCode size={19}/><span><b>QR Toko Aktif</b><small>Dicek oleh server saat scan</small></span></div>
        <div><LocateFixed size={19}/><span><b>GPS & Radius</b><small>{locationText}</small></span></div>
        <div><MapPin size={19}/><span><b>Lokasi</b><small>Koordinat hanya disimpan untuk verifikasi absensi</small></span></div>
      </aside>
    </section>

    {result&&<section className="panel attendance-success-card">
      <div className="attendance-success-icon"><CheckCircle2 size={38}/></div>
      <div>
        <span>{result.action==='check_out'?'ABSEN PULANG BERHASIL':'ABSEN MASUK BERHASIL'}</span>
        <h2>{profile.full_name}</h2>
        <p>{result.action==='check_out'?'Pulang':'Hadir'} • {result.action==='check_out'&&result.check_out_at?new Date(result.check_out_at).toLocaleString('id-ID'):result.check_in_at?new Date(result.check_in_at).toLocaleString('id-ID'):'Baru saja'}</p>
      </div>
      <div className="attendance-success-distance">
        <span>Jarak dari toko</span>
        <b>{Math.round(Number(result.distance_meters||0))} meter</b>
        <small>Metode QR + GPS</small>
      </div>
    </section>}
  </>
}
