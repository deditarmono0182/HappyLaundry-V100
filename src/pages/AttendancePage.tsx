import {attendanceError,attendanceEventAction,loadAttendanceState,recordEmployeeAttendance,type AttendanceState,type AttendanceResult} from '../lib/attendance'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, LocateFixed, MapPin, ShieldCheck, LogIn, LogOut } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../lib/auth'
import { businessDateKey,businessDateTimeLabel } from '../lib/businessTime'

export function AttendancePage(){
  const{profile}=useAuth()
  const navigate=useNavigate()
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const[result,setResult]=useState<AttendanceResult|null>(null)
  const[locationText,setLocationText]=useState('GPS belum diperiksa')
  const[attendanceState,setAttendanceState]=useState<AttendanceState|null>(null)
  const[stateBusy,setStateBusy]=useState(true)
  const[stateError,setStateError]=useState('')
  const recordLock=useRef(false)
  const stateRequest=useRef(0)
  const lastDay=useRef(businessDateKey())

  const loadState=useCallback(async()=>{
    const request=++stateRequest.current
    setStateBusy(true);setStateError('')
    try{const row=await loadAttendanceState();if(request!==stateRequest.current)return null;if(lastDay.current!==(row.attendance_date||businessDateKey())){lastDay.current=row.attendance_date||businessDateKey();setResult(null);setLocationText('GPS belum diperiksa')}setAttendanceState(row);return row}
    catch(error){if(request===stateRequest.current){setStateError(attendanceError(error));setAttendanceState(null)}return null}
    finally{if(request===stateRequest.current)setStateBusy(false)}
  },[])

  useEffect(()=>{
    void loadState()
    const refresh=()=>{if(!recordLock.current)void loadState()}
    const visible=()=>{if(document.visibilityState==='visible')refresh()}
    const timer=window.setInterval(refresh,30000)
    window.addEventListener('focus',refresh);window.addEventListener('happylaundry-attendance-changed',refresh)
    document.addEventListener('visibilitychange',visible)
    return()=>{stateRequest.current++;window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('happylaundry-attendance-changed',refresh);document.removeEventListener('visibilitychange',visible)}
  },[loadState,profile?.id])

  const record=async(action:'check_in'|'check_out')=>{
    if(recordLock.current||!profile?.id)return
    recordLock.current=true;setBusy(true);setMessage('');setResult(null);setLocationText('Memeriksa GPS...')
    try{
      const {result:row,position}=await recordEmployeeAttendance(profile.id,action)
      setLocationText(`GPS akurasi ±${Math.round(position.coords.accuracy)} m`)
      setResult(row)
      const state=await loadState()
      window.dispatchEvent(new CustomEvent('happylaundry-attendance-changed',{detail:{action:attendanceEventAction(row)}}))
      if(state&&row.action!=='already_done'&&(action==='check_in'||row.action==='exempt'))navigate('/',{replace:true})
    }catch(error){setLocationText('Absensi belum dapat dikonfirmasi');setMessage(attendanceError(error));await loadState()}
    finally{recordLock.current=false;setBusy(false)}
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

    {stateError&&<div className="error-box" role="alert">{stateError}</div>}
    <button type="button" className="secondary-button" disabled={stateBusy||busy} onClick={()=>void loadState()}>{stateBusy?'Memeriksa status...':'Periksa Status'}</button>
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
              disabled={busy||stateBusy||!attendanceState||!!stateError}
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
        <span>{result.action==='already_done'?'ABSENSI SUDAH SELESAI':result.action==='check_out'?'ABSEN PULANG BERHASIL':'ABSEN BERHASIL'}</span>
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
