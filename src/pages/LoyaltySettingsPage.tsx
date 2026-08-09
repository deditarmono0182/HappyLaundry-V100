import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Award, CheckCircle2, Crown, Gift, Save, Sparkles } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../lib/auth'
import { formatIDR } from '../lib/format'
import { supabase } from '../lib/supabase'

type LoyaltySettings={
  id:number
  enabled:boolean
  spend_per_point:number
  point_value:number
  min_redeem_points:number
  welcome_points:number
  updated_at:string
}

const defaults:LoyaltySettings={
  id:1,
  enabled:true,
  spend_per_point:1000,
  point_value:100,
  min_redeem_points:100,
  welcome_points:10,
  updated_at:new Date().toISOString()
}

export function LoyaltySettingsPage(){
  const {profile}=useAuth()
  const [form,setForm]=useState<LoyaltySettings>(defaults)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [success,setSuccess]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const {data,error}=await supabase.from('v11210_loyalty_settings').select('*').eq('id',1).maybeSingle()
    if(error)setMessage(error.message)
    else if(data)setForm({...defaults,...data} as LoyaltySettings)
    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  const example=useMemo(()=>{
    const spend=50000
    const points=Math.floor(spend/Math.max(1,Number(form.spend_per_point)||1))
    const value=points*Math.max(0,Number(form.point_value)||0)
    return{spend,points,value}
  },[form.spend_per_point,form.point_value])

  const submit=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setMessage('');setSuccess('')
    const payload={
      ...form,
      id:1,
      spend_per_point:Math.max(1,Number(form.spend_per_point)||1),
      point_value:Math.max(0,Number(form.point_value)||0),
      min_redeem_points:Math.max(0,Math.floor(Number(form.min_redeem_points)||0)),
      welcome_points:Math.max(0,Math.floor(Number(form.welcome_points)||0)),
      updated_at:new Date().toISOString()
    }
    const {error}=await supabase.from('v11210_loyalty_settings').upsert(payload)
    if(error)setMessage(error.message)
    else{setForm(payload);setSuccess('Pengaturan Loyalty / Member berhasil disimpan.')}
    setBusy(false)
  }

  if(profile?.role!=='owner')return <section className="panel"><b>Pengaturan Loyalty / Member hanya dapat diubah Owner.</b></section>
  if(loading)return <section className="panel settings-loading">Memuat pengaturan loyalty...</section>

  return <>
    <PageHeader eyebrow="OWNER" title="Loyalty / Member" description="Atur cara pelanggan mendapatkan poin dan nilai reward HappyLaundry."/>
    <form className="loyalty-settings-grid" onSubmit={submit}>
      <section className="panel loyalty-settings-card loyalty-hero-card">
        <div className="loyalty-hero-icon"><Crown size={28}/></div>
        <div><span>PROGRAM MEMBER</span><h2>HappyLaundry Rewards</h2><p>Pelanggan Member mendapatkan poin otomatis ketika order berubah menjadi lunas.</p></div>
        <label className="loyalty-enable"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/><span>{form.enabled?'Program Aktif':'Program Nonaktif'}</span></label>
      </section>

      <section className="panel loyalty-settings-card">
        <header><Award size={21}/><div><b>Perolehan Poin</b><small>Tentukan berapa rupiah transaksi untuk mendapatkan 1 poin.</small></div></header>
        <label>Belanja per 1 Poin<input type="number" min="1" value={form.spend_per_point} onChange={e=>setForm({...form,spend_per_point:Number(e.target.value)})}/><small>Contoh: Rp 1.000 = 1 poin.</small></label>
        <label>Bonus Poin Member Baru<input type="number" min="0" value={form.welcome_points} onChange={e=>setForm({...form,welcome_points:Number(e.target.value)})}/><small>Diberikan satu kali saat pelanggan pertama kali menjadi Member.</small></label>
      </section>

      <section className="panel loyalty-settings-card">
        <header><Gift size={21}/><div><b>Nilai Reward</b><small>Fondasi nilai penukaran poin untuk tahap integrasi Kasir berikutnya.</small></div></header>
        <label>Nilai 1 Poin<input type="number" min="0" value={form.point_value} onChange={e=>setForm({...form,point_value:Number(e.target.value)})}/><small>Contoh: 1 poin = {formatIDR(Number(form.point_value||0))} nilai reward.</small></label>
        <label>Minimum Poin Ditukar<input type="number" min="0" value={form.min_redeem_points} onChange={e=>setForm({...form,min_redeem_points:Number(e.target.value)})}/></label>
      </section>

      <section className="panel loyalty-example-card">
        <Sparkles size={22}/><div><span>CONTOH OTOMATIS</span><b>Belanja {formatIDR(example.spend)} → {example.points} poin</b><small>Nilai reward setara {formatIDR(example.value)} berdasarkan pengaturan sekarang.</small></div>
      </section>

      {message&&<div className="error-box loyalty-wide">{message}</div>}
      {success&&<div className="success-box loyalty-wide"><CheckCircle2 size={18}/>{success}</div>}
      <div className="settings-actions loyalty-wide"><button className="primary-button" disabled={busy}><Save size={17}/>{busy?'Menyimpan...':'Simpan Loyalty'}</button></div>
    </form>
  </>
}
