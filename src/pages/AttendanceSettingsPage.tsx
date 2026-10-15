import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2, LocateFixed, MapPin, Save, ShieldCheck
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

interface AttendanceSettings{
  id:number
  store_name:string
  latitude:number|null
  longitude:number|null
  radius_meters:number
  attendance_start:string
  attendance_end:string
  enforce_time:boolean
  auto_logout_grace_minutes:number
  updated_at:string
}

const defaults:AttendanceSettings={
  id:1,
  store_name:'HappyLaundry Babakan',
  latitude:null,
  longitude:null,
  radius_meters:100,
  attendance_start:'07:00',
  attendance_end:'21:00',
  enforce_time:true,
  auto_logout_grace_minutes:15,
  updated_at:new Date().toISOString()
}

export function AttendanceSettingsPage(){
  const{profile}=useAuth()
  const[form,setForm]=useState<AttendanceSettings>(defaults)
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const[success,setSuccess]=useState('')


  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const{data,error}=await supabase
      .from('v112_attendance_settings')
      .select('*')
      .eq('id',1)
      .maybeSingle()

    if(error)setMessage(error.message)
    else setForm(data?{...defaults,...data} as AttendanceSettings:defaults)

    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  const save=async(event:FormEvent)=>{
    event.preventDefault()
    if(profile?.role!=='owner')return
    if(form.latitude===null||form.longitude===null){
      setMessage('Latitude dan longitude toko wajib diisi.')
      return
    }
    setBusy(true);setMessage('');setSuccess('')
    const payload={
      id:1,
      store_name:form.store_name.trim()||'HappyLaundry Babakan',
      latitude:Number(form.latitude),
      longitude:Number(form.longitude),
      radius_meters:Math.max(20,Math.min(1000,Number(form.radius_meters)||100)),
      attendance_start:form.attendance_start,
      attendance_end:form.attendance_end,
      enforce_time:Boolean(form.enforce_time),
      auto_logout_grace_minutes:Math.max(0,Math.min(120,Number(form.auto_logout_grace_minutes)||15)),
      updated_at:new Date().toISOString()
    }
    const{error}=await supabase.from('v112_attendance_settings').update(payload).eq('id',1)
    if(error)setMessage(error.message)
    else{
      setSuccess('Pengaturan absensi berhasil disimpan.')
      await load()
    }
    setBusy(false)
  }


  const mapsLink=useMemo(()=>{
    if(form.latitude===null||form.longitude===null)return ''
    return `https://www.google.com/maps?q=${form.latitude},${form.longitude}`
  },[form.latitude,form.longitude])

  if(profile?.role!=='owner')return <div className="error-box">Halaman ini hanya untuk Owner.</div>
  if(loading)return <section className="panel settings-loading">Memuat pengaturan absensi...</section>

  return <>
    <PageHeader
      eyebrow="OWNER • GPS ATTENDANCE"
      title="Pengaturan Absensi & Jam Kerja"
      description="Atur lokasi GPS, radius toko, jam kerja karyawan, dan toleransi logout otomatis. Absensi masuk tidak lagi menggunakan kamera atau QR."
    />

    <div className="attendance-settings-grid attendance-settings-gps-only">
      <form className="panel attendance-config-card" onSubmit={save}>
        <header><MapPin size={21}/><div><b>Lokasi & Radius Toko</b><small>Koordinat ini menjadi pusat validasi GPS karyawan.</small></div></header>

        <label>Nama Cabang
          <input value={form.store_name} onChange={e=>setForm({...form,store_name:e.target.value})}/>
        </label>

        <div className="form-grid-two">
          <label>Latitude
            <input type="number" step="0.0000001" value={form.latitude??''} onChange={e=>setForm({...form,latitude:e.target.value===''?null:Number(e.target.value)})} placeholder="-6.1234567"/>
          </label>
          <label>Longitude
            <input type="number" step="0.0000001" value={form.longitude??''} onChange={e=>setForm({...form,longitude:e.target.value===''?null:Number(e.target.value)})} placeholder="108.1234567"/>
          </label>
        </div>

        {mapsLink&&<a className="settings-link" href={mapsLink} target="_blank" rel="noreferrer"><MapPin size={15}/>Lihat titik di Google Maps</a>}

        <label>Radius Absensi
          <select value={form.radius_meters} onChange={e=>setForm({...form,radius_meters:Number(e.target.value)})}>
            <option value={25}>25 meter</option>
            <option value={50}>50 meter</option>
            <option value={75}>75 meter</option>
            <option value={100}>100 meter</option>
            <option value={150}>150 meter</option>
            <option value={200}>200 meter</option>
          </select>
        </label>

        <div className="attendance-config-divider"/>

        <header><ShieldCheck size={21}/><div><b>Jam Kerja Karyawan</b><small>Berlaku hanya untuk karyawan yang ditandai Wajib Absensi.</small></div></header>

        <label className="print-switch">
          <input type="checkbox" checked={form.enforce_time} onChange={e=>setForm({...form,enforce_time:e.target.checked})}/>
          <span><b>Aktifkan Jam Kerja</b><small>Jika aktif, absensi dan akses kerja mengikuti jam mulai sampai jam selesai.</small></span>
        </label>

        <div className="form-grid-two">
          <label>Mulai Kerja
            <input type="time" value={form.attendance_start} onChange={e=>setForm({...form,attendance_start:e.target.value})}/>
          </label>
          <label>Selesai Kerja
            <input type="time" value={form.attendance_end} onChange={e=>setForm({...form,attendance_end:e.target.value})}/>
          </label>
        </div>

        <label>Toleransi Logout Otomatis
          <select value={form.auto_logout_grace_minutes} onChange={e=>setForm({...form,auto_logout_grace_minutes:Number(e.target.value)})}>
            <option value={0}>Tepat saat jam kerja selesai</option>
            <option value={5}>5 menit</option>
            <option value={10}>10 menit</option>
            <option value={15}>15 menit (disarankan)</option>
            <option value={30}>30 menit</option>
            <option value={60}>60 menit</option>
          </select>
          <small>Karyawan wajib absensi akan logout otomatis setelah jam selesai + toleransi. Owner dan karyawan Bebas Absensi tidak terkena.</small>
        </label>

        {message&&<div className="error-box">{message}</div>}
        {success&&<div className="success-box"><CheckCircle2 size={17}/>{success}</div>}

        <button className="primary-button" disabled={busy}><Save size={16}/>{busy?'Menyimpan...':'Simpan Pengaturan Absensi'}</button>
      </form>

      <section className="panel attendance-qr-owner-card attendance-gps-owner-card">
        <header><LocateFixed size={23}/><div><b>Absensi GPS Aktif</b><small>Karyawan tidak lagi menggunakan kamera atau QR untuk absen.</small></div></header>

        <div className="attendance-gps-summary">
          <div><span>Metode Absen</span><b>Login + GPS</b></div>
          <div><span>Radius Toko</span><b>{form.radius_meters} meter</b></div>
          <div><span>Jam Kerja</span><b>{form.enforce_time?`${form.attendance_start} – ${form.attendance_end}`:'Tidak dibatasi'}</b></div>
        </div>

        <div className="attendance-qr-warning">
          <ShieldCheck size={18}/>
          <span>Setelah login, karyawan Wajib Absensi akan diminta Location/GPS. Jika berada dalam radius toko, Absen Masuk tercatat otomatis dan menu kerja terbuka.</span>
        </div>

        <div className="attendance-qr-warning">
          <MapPin size={18}/>
          <span>Absen Pulang juga menggunakan GPS dari halaman Absen. Karyawan Bebas Absensi tidak perlu GPS.</span>
        </div>
      </section>
    </div>
  </>
}
