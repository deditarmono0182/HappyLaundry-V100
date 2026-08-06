import { ChangeEvent, useState } from 'react'
import { CheckCircle2, DatabaseBackup, Download, FileUp, ShieldCheck } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'

interface BackupData {
  version:string
  exported_at:string
  customers:unknown[]
  services:unknown[]
  orders:unknown[]
  order_items:unknown[]
  payments:unknown[]
  cash_transactions:unknown[]
  settings:unknown[]
}

export function BackupPage(){
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [success,setSuccess]=useState('')

  const exportBackup=async()=>{
    setBusy(true);setMessage('');setSuccess('')
    const tables=[
      ['customers','v100_customers'],
      ['services','v100_services'],
      ['orders','v100_orders'],
      ['order_items','v100_order_items'],
      ['payments','v100_payments'],
      ['cash_transactions','v100_cash_transactions'],
      ['settings','v100_store_settings']
    ] as const

    const backup:Record<string,unknown>={version:'103.0',exported_at:new Date().toISOString()}
    for(const [key,table] of tables){
      const {data,error}=await supabase.from(table).select('*')
      if(error){setMessage(`Gagal membaca ${table}: ${error.message}`);setBusy(false);return}
      backup[key]=data||[]
    }
    const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'})
    const url=URL.createObjectURL(blob)
    const anchor=document.createElement('a')
    anchor.href=url
    anchor.download=`happylaundry-backup-${new Date().toISOString().slice(0,10)}.json`
    anchor.click();URL.revokeObjectURL(url)
    setSuccess('Backup berhasil diunduh. Simpan file di Google Drive atau flashdisk.')
    setBusy(false)
  }

  const importMaster=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0]
    if(!file)return
    if(!window.confirm('Import hanya akan menambahkan/memperbarui Pelanggan, Layanan, dan Pengaturan. Lanjutkan?'))return
    setBusy(true);setMessage('');setSuccess('')
    try{
      const parsed=JSON.parse(await file.text()) as BackupData
      if(!parsed.version)throw new Error('Format backup tidak dikenali.')
      const customerRows=(parsed.customers||[]).map(({id,created_at,...row}:any)=>row)
      const serviceRows=(parsed.services||[]).map(({id,created_at,...row}:any)=>row)
      if(customerRows.length){
        const {error}=await supabase.from('v100_customers').upsert(customerRows,{onConflict:'phone'})
        if(error)throw error
      }
      if(serviceRows.length){
        const {error}=await supabase.from('v100_services').upsert(serviceRows,{onConflict:'name'})
        if(error)throw error
      }
      if(parsed.settings?.length){
        const {error}=await supabase.from('v100_store_settings').upsert(parsed.settings)
        if(error)throw error
      }
      setSuccess('Master data berhasil diimpor. Refresh halaman untuk melihat perubahan.')
    }catch(error){
      setMessage(error instanceof Error?error.message:'Import gagal.')
    }finally{
      setBusy(false);event.target.value=''
    }
  }

  return <>
    <PageHeader eyebrow="KEAMANAN DATA" title="Backup & Pemulihan" description="Unduh salinan data operasional dan pulihkan master data jika diperlukan."/>
    <section className="backup-grid">
      <article className="panel backup-card">
        <DatabaseBackup size={30}/>
        <h2>Backup Lengkap JSON</h2>
        <p>Mencakup pelanggan, layanan, order, item order, pembayaran, kas, dan pengaturan.</p>
        <button className="primary-button" onClick={()=>void exportBackup()} disabled={busy}><Download size={17}/>{busy?'Menyiapkan...':'Download Backup'}</button>
      </article>
      <article className="panel backup-card">
        <FileUp size={30}/>
        <h2>Import Master Data</h2>
        <p>Memulihkan pelanggan, layanan, dan pengaturan. Transaksi lama tidak ditimpa untuk mencegah duplikasi.</p>
        <label className="secondary-button backup-upload"><FileUp size={17}/>Pilih File Backup<input type="file" accept=".json,application/json" onChange={e=>void importMaster(e)} disabled={busy}/></label>
      </article>
      <article className="panel backup-card backup-safety">
        <ShieldCheck size={30}/>
        <h2>Aturan Aman</h2>
        <ul><li>Lakukan backup minimal seminggu sekali.</li><li>Simpan salinan di dua tempat berbeda.</li><li>Jangan membagikan file backup kepada orang lain.</li><li>Gunakan Supabase Backup untuk pemulihan database penuh.</li></ul>
      </article>
    </section>
    {message&&<div className="error-box inline-message">{message}</div>}
    {success&&<div className="success-box inline-message"><CheckCircle2 size={18}/>{success}</div>}
  </>
}
