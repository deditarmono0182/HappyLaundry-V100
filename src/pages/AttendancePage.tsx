import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, LocateFixed, MapPin, ShieldCheck, LogIn, LogOut } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { businessDateTimeLabel } from '../lib/businessTime'

type AttendanceState={
  attendance_required?:boolean
  attended_today?:boolean
  checked_out?:boolean
  within_work_hours?:boolean
  work_start?:string
  work_end?:string
  check_in_at?:string|null
  check_out_at?:string|null
}

type AttendanceResult={
  ok?:boolean
  created?:boolean
  status?:string
  distance_meters?:number
  attendance_date?:string
  check_in_at?:string
  check_out_at?:string
  action?:'check_in'|'check_out'|'already_checked_in'|'already_done'|'exempt'
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

export function AttendancePage(){
  const{profile}=useAuth()
  const navigate=useNavigate()
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const[result,setResult]=useState<AttendanceResult|null>(null)
  const[locationText,setLocationText]=useState('GPS belum diperiksa')
  const[attendanceState,setAttendanceState]=useState<AttendanceState|null>(null)

  const loadState=async()=>{
    const{data}=await supabase.rpc('v11322_current_attendance_state')
    if(!data)return
    const row=(Array.isArray(data)?data[0]:data) as AttendanceState
    setAttendanceState(row)
  }

  useEffect(()=>{void loadState()},[])

  const record=async(action:'check_in'|'check_out')=>{
    setBusy(true)
    setMessage('')
    setResult(null)
    setLocationText('Memeriksa GPS...')

    let pos:GeolocationPosition
    try{
      pos=await getLocation()
    }catch(error){
      setLocationText('GPS gagal')
      const text=error instanceof GeolocationPositionError
        ? error.code===1
          ? 'Izin Location/GPS ditolak. Aktifkan Location untuk HappyLaundry lalu coba lagi.'
          : 'Lokasi GPS tidak dapat dibaca. Pastikan Location aktif lalu coba lagi.'
        : error instanceof Error?error.message:'GPS gagal dibaca.'
      setMessage(text)
      setBusy(false)
      return
    }

    setLocationText(`GPS akurasi ±${Math.round(pos.coords.accuracy)} m`)

    const{data,error}=await supabase.rpc('v113070_record_gps_attendance',{
      p_action:action,
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
      await loadState()

      if(action==='check_in'){
        window.dispatchEvent(new CustomEvent('happylaundry-attendance-changed',{
          detail:{action:'check_in'}
        }))
        window.setTimeout(()=>navigate('/',{replace:true}),350)
      }else{
        window.dispatchEvent(new CustomEvent('happylaundry-attendance-changed',{
          detail:{action:'check_out'}
        }))
      }
    }else{
      setMessage(row?.message||'Absensi tidak berhasil.')
    }

    setBusy(false)
  }

  if(profile?.role!=='employee'){
    return <div className="error-box">Menu Absen digunakan untuk akun karyawan.</div>
  }

  if(attendanceState?.attendance_required===false){
    return <section className="panel attendance-exempt-card">
      <ShieldCheck size={32}/>
      <div>
        <b>Bebas Absensi</b>
        <span>Owner menetapkan akun ini tidak wajib absensi GPS dan tidak dibatasi jam kerja.</span>
      </div>
    </section>
  }

  const alreadyIn=Boolean(attendanceState?.attended_today&&!attendanceState?.checked_out)
  const finished=Boolean(attendanceState?.attended_today&&attendanceState?.checked_out)

  return <>
    <PageHeader
      eyebrow="GPS ATTENDANCE"
      title={finished?'Absensi Hari Ini Selesai':alreadyIn?'Absen Pulang':'Absen Karyawan'}
      description={
        finished
          ?'Absen Masuk dan Pulang hari ini sudah tercatat.'
          :alreadyIn
            ?'Tekan Absen Pulang. Sistem akan memeriksa GPS dan radius toko.'
            :'Absen Masuk biasanya berjalan otomatis setelah login. Jika belum, tekan tombol di bawah.'
      }
    />

    <section className="attendance-employee-grid">
      <article className="panel attendance-scan-card">
        <div className="attendance-scan-heading">
          <div className="attendance-scan-icon"><LocateFixed size={28}/></div>
          <div>
            <h2>{finished?'Absensi Selesai':alreadyIn?'Absen Pulang dengan GPS':'Absen Masuk dengan GPS'}</h2>
            <p>Tidak menggunakan kamera atau QR. Pastikan Location/GPS aktif dan Anda berada di area HappyLaundry.</p>
          </div>
        </div>

        <div className="attendance-scan-placeholder">
          <MapPin size={68}/>
          <b>Verifikasi GPS</b>
          <span>{locationText}</span>
        </div>

        <div className="attendance-scan-actions">
          {!finished&&
            <button
              className="primary-button attendance-big-button"
              disabled={busy}
              onClick={()=>void record(alreadyIn?'check_out':'check_in')}
            >
              {alreadyIn?<LogOut size={20}/>:<LogIn size={20}/>}
              {busy?'MEMERIKSA GPS...':alreadyIn?'ABSEN PULANG':'ABSEN MASUK'}
            </button>}
        </div>

        {message&&<div className="error-box attendance-message">{message}</div>}
      </article>

      <aside className="panel attendance-verification-card">
        <h3>Verifikasi Kehadiran</h3>
        <div><ShieldCheck size={19}/><span><b>Login Karyawan</b><small>{profile.full_name} • {profile.login_id}</small></span></div>
        <div><LocateFixed size={19}/><span><b>GPS & Radius</b><small>{locationText}</small></span></div>
        <div><MapPin size={19}/><span><b>Metode</b><small>Login + GPS otomatis, tanpa kamera</small></span></div>
      </aside>
    </section>

    {result&&<section className="panel attendance-success-card">
      <div className="attendance-success-icon"><CheckCircle2 size={38}/></div>
      <div>
        <span>{result.action==='check_out'?'ABSEN PULANG BERHASIL':'ABSEN BERHASIL'}</span>
        <h2>{profile.full_name}</h2>
        <p>{
          result.action==='check_out'&&result.check_out_at
            ?`Pulang • ${businessDateTimeLabel(result.check_out_at)}`
            :result.check_in_at
              ?`Hadir • ${businessDateTimeLabel(result.check_in_at)}`
              :'Status absensi sudah tercatat.'
        }</p>
      </div>
      <div className="attendance-success-distance">
        <span>Jarak dari toko</span>
        <b>{Math.round(Number(result.distance_meters||0))} meter</b>
        <small>Metode GPS</small>
      </div>
    </section>}
  </>
}
