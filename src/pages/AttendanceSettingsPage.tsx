import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2, Download, MapPin, Printer, QrCode, RefreshCw, Save, ShieldCheck
} from 'lucide-react'
import QRCode from 'qrcode'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

interface AttendanceSettings{
  id:number
  store_name:string
  latitude:number|null
  longitude:number|null
  radius_meters:number
  qr_token:string
  qr_version:number
  qr_generated_at:string
  attendance_start:string
  attendance_end:string
  enforce_time:boolean
  updated_at:string
}

const defaults:AttendanceSettings={
  id:1,
  store_name:'HappyLaundry Babakan',
  latitude:null,
  longitude:null,
  radius_meters:100,
  qr_token:'',
  qr_version:1,
  qr_generated_at:new Date().toISOString(),
  attendance_start:'06:00',
  attendance_end:'11:00',
  enforce_time:false,
  updated_at:new Date().toISOString()
}

export function AttendanceSettingsPage(){
  const{profile}=useAuth()
  const[form,setForm]=useState<AttendanceSettings>(defaults)
  const[qrDataUrl,setQrDataUrl]=useState('')
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const[success,setSuccess]=useState('')
  const[usageToday,setUsageToday]=useState(0)

  const renderQr=useCallback(async(token:string)=>{
    if(!token){setQrDataUrl('');return}
    try{
      const url=await QRCode.toDataURL(`HL-ATT:${token}`,{
        width:520,
        margin:2,
        errorCorrectionLevel:'H'
      })
      setQrDataUrl(url)
    }catch{
      setQrDataUrl('')
    }
  },[])

  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const[{data,error},{data:usage,error:usageError}]=await Promise.all([
      supabase.from('v112_attendance_settings').select('*').eq('id',1).maybeSingle(),
      supabase.rpc('v112_attendance_qr_usage_today')
    ])
    if(error)setMessage(error.message)
    else{
      const next=data?{...defaults,...data} as AttendanceSettings:defaults
      setForm(next)
      await renderQr(next.qr_token)
    }
    if(!usageError&&usage){
      const row=(Array.isArray(usage)?usage[0]:usage) as {usage_count?:number}|null
      setUsageToday(Number(row?.usage_count||0))
    }
    setLoading(false)
  },[renderQr])

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

  const generateNewQr=async()=>{
    if(!window.confirm('Generate QR baru? QR lama langsung tidak berlaku untuk absensi berikutnya.'))return
    setBusy(true);setMessage('');setSuccess('')
    const{data,error}=await supabase.rpc('v112_generate_attendance_qr')
    if(error)setMessage(error.message)
    else{
      const row=(Array.isArray(data)?data[0]:data) as {qr_token?:string;qr_version?:number}|null
      if(row?.qr_token){
        setForm(current=>({...current,qr_token:row.qr_token!,qr_version:Number(row.qr_version||current.qr_version+1),qr_generated_at:new Date().toISOString()}))
        await renderQr(row.qr_token)
        setUsageToday(0)
        setSuccess('QR Absen baru berhasil dibuat. QR lama otomatis tidak berlaku.')
      }
    }
    setBusy(false)
  }

  const downloadQr=()=>{
    if(!qrDataUrl)return
    const a=document.createElement('a')
    a.href=qrDataUrl
    a.download=`QR-ABSEN-HAPPYLAUNDRY-V${form.qr_version}.png`
    a.click()
  }

  const printQr=()=>{
    if(!qrDataUrl)return
    const w=window.open('','_blank','width=650,height=760')
    if(!w)return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR Absen HappyLaundry</title>
      <style>
        body{font-family:Arial;text-align:center;padding:24px;color:#153f5b}
        img{width:430px;max-width:85vw}
        h1{margin:8px 0;color:#1264a3}
        p{margin:5px 0}
        .box{border:2px solid #1e88e5;border-radius:18px;padding:20px;max-width:520px;margin:auto}
        .small{font-size:12px;color:#668094}
        @media print{button{display:none}}
      </style></head><body>
      <div class="box">
        <h1>QR ABSEN KARYAWAN</h1>
        <p><b>${form.store_name}</b></p>
        <img src="${qrDataUrl}">
        <p>Login → menu Absen → Scan QR → izinkan GPS</p>
        <p class="small">QR Versi ${form.qr_version} • Radius ${form.radius_meters} meter</p>
      </div>
      <br><button onclick="window.print()">Print</button>
      <script>window.onload=()=>setTimeout(()=>window.print(),250)</script>
      </body></html>`)
    w.document.close()
  }

  const mapsLink=useMemo(()=>{
    if(form.latitude===null||form.longitude===null)return ''
    return `https://www.google.com/maps?q=${form.latitude},${form.longitude}`
  },[form.latitude,form.longitude])

  if(profile?.role!=='owner')return <div className="error-box">Halaman ini hanya untuk Owner.</div>
  if(loading)return <section className="panel settings-loading">Memuat pengaturan absensi...</section>

  return <>
    <PageHeader
      eyebrow="OWNER • SMART ATTENDANCE"
      title="Pengaturan Absensi"
      description="Atur QR toko, koordinat GPS, radius absensi, dan aturan jam. Owner dapat mengelola pengaturan ini dari mana saja."
    />

    <div className="attendance-settings-grid">
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

        <header><ShieldCheck size={21}/><div><b>Aturan Waktu</b><small>GPS dan QR selalu wajib. Batas waktu bisa diaktifkan atau dimatikan.</small></div></header>

        <label className="print-switch">
          <input type="checkbox" checked={form.enforce_time} onChange={e=>setForm({...form,enforce_time:e.target.checked})}/>
          <span><b>Batasi jam absen masuk</b><small>Jika aktif, scan di luar jam akan ditolak.</small></span>
        </label>

        <div className="form-grid-two">
          <label>Mulai
            <input type="time" value={form.attendance_start} onChange={e=>setForm({...form,attendance_start:e.target.value})}/>
          </label>
          <label>Sampai
            <input type="time" value={form.attendance_end} onChange={e=>setForm({...form,attendance_end:e.target.value})}/>
          </label>
        </div>

        {message&&<div className="error-box">{message}</div>}
        {success&&<div className="success-box"><CheckCircle2 size={17}/>{success}</div>}

        <button className="primary-button" disabled={busy}><Save size={16}/>{busy?'Menyimpan...':'Simpan Pengaturan Absensi'}</button>
      </form>

      <section className="panel attendance-qr-owner-card">
        <header><QrCode size={23}/><div><b>QR Absen Aktif</b><small>Print satu kali dan tempel di toko. Ganti hanya jika Owner ingin mengganti QR.</small></div></header>

        <div className="attendance-qr-meta">
          <span>Versi QR <b>#{form.qr_version}</b></span>
          <span>Dipakai Hari Ini <b>{usageToday} kali</b></span>
        </div>

        {qrDataUrl
          ? <img className="attendance-owner-qr" src={qrDataUrl} alt="QR Absen HappyLaundry"/>
          : <div className="attendance-owner-qr-empty"><QrCode size={50}/><b>Belum ada QR aktif</b></div>}

        <div className="attendance-qr-actions">
          <button type="button" className="primary-button" onClick={()=>void generateNewQr()} disabled={busy}><RefreshCw size={16}/>Generate QR Baru</button>
          <button type="button" className="secondary-button" onClick={downloadQr} disabled={!qrDataUrl}><Download size={16}/>Download PNG</button>
          <button type="button" className="secondary-button" onClick={printQr} disabled={!qrDataUrl}><Printer size={16}/>Print QR</button>
        </div>

        <div className="attendance-qr-warning">
          <ShieldCheck size={18}/>
          <span>Setelah Generate QR Baru, QR lama langsung ditolak. Karyawan tetap harus berada dalam radius GPS toko.</span>
        </div>
      </section>
    </div>
  </>
}
