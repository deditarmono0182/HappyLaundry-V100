import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Building2, CheckCircle2, CreditCard, ImageUp, Plus, QrCode, Save, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

type OnlineSettings={
  id:number
  qris_enabled:boolean
  qris_image_url:string|null
  qris_image_path:string|null
  qris_merchant_name:string
  qris_note:string
  transfer_enabled:boolean
  updated_at:string
}
type Bank={
  id:string
  bank_name:string
  account_number:string
  account_name:string
  is_active:boolean
  sort_order:number
}

const defaults:OnlineSettings={
  id:1,qris_enabled:false,qris_image_url:null,qris_image_path:null,
  qris_merchant_name:'HappyLaundry',qris_note:'Scan QRIS lalu upload bukti pembayaran.',
  transfer_enabled:false,updated_at:new Date().toISOString()
}

export function OnlinePaymentSettingsPage(){
  const {profile}=useAuth()
  const [settings,setSettings]=useState<OnlineSettings>(defaults)
  const [banks,setBanks]=useState<Bank[]>([])
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [success,setSuccess]=useState('')

  const load=useCallback(async()=>{
    setMessage('')
    const [s,b]=await Promise.all([
      supabase.from('v1129_online_payment_settings').select('*').eq('id',1).maybeSingle(),
      supabase.from('v1129_bank_accounts').select('*').order('sort_order').order('bank_name')
    ])
    if(s.error||b.error){setMessage((s.error||b.error)?.message||'Gagal memuat pengaturan.');return}
    if(s.data)setSettings({...defaults,...s.data} as OnlineSettings)
    setBanks((b.data as Bank[])||[])
  },[])

  useEffect(()=>{void load()},[load])

  if(profile?.role!=='owner'){
    return <section className="panel"><b>Hanya Owner yang dapat mengubah QRIS dan rekening pembayaran online.</b></section>
  }

  const uploadQris=async(file:File|null)=>{
    if(!file)return
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
      setMessage('QRIS harus berupa JPG, PNG, atau WEBP.');return
    }
    if(file.size>3*1024*1024){setMessage('Ukuran gambar QRIS maksimal 3 MB.');return}
    setBusy(true);setMessage('');setSuccess('')
    try{
      const ext=(file.name.split('.').pop()||'png').toLowerCase()
      const path=`qris/qris-${Date.now()}.${ext}`
      const up=await supabase.storage.from('online-payment-assets').upload(path,file,{upsert:false,contentType:file.type})
      if(up.error)throw up.error
      const url=supabase.storage.from('online-payment-assets').getPublicUrl(path).data.publicUrl
      const oldPath=settings.qris_image_path
      const next={...settings,qris_image_url:url,qris_image_path:path,qris_enabled:true,updated_at:new Date().toISOString()}
      const saved=await supabase.from('v1129_online_payment_settings').upsert(next)
      if(saved.error)throw saved.error
      if(oldPath)await supabase.storage.from('online-payment-assets').remove([oldPath])
      setSettings(next)
      setSuccess('QRIS baru berhasil disimpan dan langsung dipakai di Tracking Pelanggan.')
    }catch(e){setMessage(e instanceof Error?e.message:'Upload QRIS gagal.')}
    finally{setBusy(false)}
  }

  const saveSettings=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setMessage('');setSuccess('')
    const payload={...settings,id:1,updated_at:new Date().toISOString()}
    const {error}=await supabase.from('v1129_online_payment_settings').upsert(payload)
    if(error)setMessage(error.message)
    else setSuccess('Pengaturan pembayaran online berhasil disimpan.')
    setBusy(false)
  }

  const addBank=()=>setBanks(current=>[...current,{
    id:crypto.randomUUID(),bank_name:'',account_number:'',account_name:'',is_active:true,sort_order:current.length+1
  }])

  const saveBank=async(bank:Bank)=>{
    setBusy(true);setMessage('');setSuccess('')
    const {error}=await supabase.from('v1129_bank_accounts').upsert(bank)
    if(error)setMessage(error.message)
    else{setSuccess(`${bank.bank_name||'Rekening'} berhasil disimpan.`);await load()}
    setBusy(false)
  }

  const removeBank=async(bank:Bank)=>{
    if(!window.confirm(`Hapus rekening ${bank.bank_name} ${bank.account_number}?`))return
    setBusy(true)
    const {error}=await supabase.from('v1129_bank_accounts').delete().eq('id',bank.id)
    if(error)setMessage(error.message)
    else{setBanks(current=>current.filter(x=>x.id!==bank.id));setSuccess('Rekening dihapus.')}
    setBusy(false)
  }

  return <>
    <PageHeader
      eyebrow="OWNER"
      title="Pembayaran Online"
      description="Atur QRIS dan rekening yang otomatis tampil di Tracking Pelanggan."
    />

    <form className="settings-grid online-payment-settings" onSubmit={saveSettings}>
      <section className="panel settings-card">
        <header><QrCode size={21}/><div><b>QRIS</b><small>Owner dapat mengganti gambar QRIS kapan saja.</small></div></header>
        <label className="settings-toggle">
          <input type="checkbox" checked={settings.qris_enabled} onChange={e=>setSettings({...settings,qris_enabled:e.target.checked})}/>
          <span>Aktifkan pembayaran QRIS di Tracking Pelanggan</span>
        </label>
        <label>Nama Merchant<input value={settings.qris_merchant_name} onChange={e=>setSettings({...settings,qris_merchant_name:e.target.value})}/></label>
        <label>Petunjuk QRIS<textarea rows={3} value={settings.qris_note} onChange={e=>setSettings({...settings,qris_note:e.target.value})}/></label>
        {settings.qris_image_url
          ? <img className="owner-qris-preview" src={settings.qris_image_url} alt="QRIS aktif"/>
          : <div className="owner-qris-empty"><QrCode size={42}/><span>Belum ada QRIS</span></div>}
        <label className="online-upload-button">
          <ImageUp size={17}/>{settings.qris_image_url?'Ganti QRIS':'Upload QRIS'}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void uploadQris(e.target.files?.[0]||null)}/>
        </label>
      </section>

      <section className="panel settings-card">
        <header><CreditCard size={21}/><div><b>Transfer Bank</b><small>Aktif/nonaktif rekening yang tampil ke pelanggan.</small></div></header>
        <label className="settings-toggle">
          <input type="checkbox" checked={settings.transfer_enabled} onChange={e=>setSettings({...settings,transfer_enabled:e.target.checked})}/>
          <span>Aktifkan transfer bank di Tracking Pelanggan</span>
        </label>
        <button type="button" className="secondary-button" onClick={addBank}><Plus size={16}/>Tambah Rekening</button>
        <div className="owner-bank-list">
          {banks.length===0&&<div className="mini-empty">Belum ada rekening bank.</div>}
          {banks.map((bank,index)=><article className="owner-bank-card" key={bank.id}>
            <div className="owner-bank-grid">
              <label>Bank<input value={bank.bank_name} onChange={e=>setBanks(current=>current.map(x=>x.id===bank.id?{...x,bank_name:e.target.value}:x))}/></label>
              <label>No. Rekening<input value={bank.account_number} onChange={e=>setBanks(current=>current.map(x=>x.id===bank.id?{...x,account_number:e.target.value}:x))}/></label>
              <label>Atas Nama<input value={bank.account_name} onChange={e=>setBanks(current=>current.map(x=>x.id===bank.id?{...x,account_name:e.target.value}:x))}/></label>
              <label className="settings-toggle bank-active">
                <input type="checkbox" checked={bank.is_active} onChange={e=>setBanks(current=>current.map(x=>x.id===bank.id?{...x,is_active:e.target.checked}:x))}/>
                <span>Aktif</span>
              </label>
            </div>
            <div className="owner-bank-actions">
              <button type="button" className="secondary-button" disabled={busy||!bank.bank_name||!bank.account_number||!bank.account_name} onClick={()=>void saveBank({...bank,sort_order:index+1})}><Save size={15}/>Simpan</button>
              <button type="button" className="danger-button" onClick={()=>void removeBank(bank)}><Trash2 size={15}/>Hapus</button>
            </div>
          </article>)}
        </div>
      </section>

      {message&&<div className="error-box settings-wide">{message}</div>}
      {success&&<div className="success-box settings-wide"><CheckCircle2 size={18}/>{success}</div>}
      <div className="settings-actions settings-wide">
        <button className="primary-button" disabled={busy}><Save size={17}/>{busy?'Menyimpan...':'Simpan Pengaturan Online'}</button>
      </div>
    </form>
  </>
}
