import { ChangeEvent, FormEvent, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, DatabaseBackup, Download, FileUp,
  RotateCcw, ShieldAlert, ShieldCheck, Trash2
} from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../lib/auth'
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

type ResetType='orders'|'customers'|'services'|'all'

const resetInfo:Record<ResetType,{
  title:string
  description:string
  warning:string
  confirm:string
}>={
  orders:{
    title:'Reset Data Order',
    description:'Menghapus seluruh order, item order, pembayaran, dan transaksi kas yang terkait order.',
    warning:'Data pelanggan dan layanan tetap disimpan.',
    confirm:'RESET ORDER'
  },
  customers:{
    title:'Reset Data Pelanggan',
    description:'Menghapus seluruh pelanggan. Karena order terhubung ke pelanggan, seluruh order dan transaksi terkait juga akan dihapus.',
    warning:'Data layanan tetap disimpan.',
    confirm:'RESET PELANGGAN'
  },
  services:{
    title:'Reset Data Layanan',
    description:'Menghapus seluruh master layanan. Order lama tetap ada, tetapi referensi layanan pada item order dapat menjadi kosong.',
    warning:'Gunakan hanya jika ingin membuat ulang daftar layanan.',
    confirm:'RESET LAYANAN'
  },
  all:{
    title:'Reset ALL DATA',
    description:'Menghapus data operasional: order, pembayaran, pelanggan, layanan, pengeluaran, stok, pergerakan stok, dan supplier.',
    warning:'Akun Owner/Karyawan, pengaturan toko, dan konfigurasi persentase bagi hasil tetap disimpan agar Anda masih bisa login.',
    confirm:'RESET ALL DATA'
  }
}

export function BackupPage(){
  const{profile}=useAuth()
  const isOwner=profile?.role==='owner'
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [success,setSuccess]=useState('')
  const [resetType,setResetType]=useState<ResetType|null>(null)
  const [confirmation,setConfirmation]=useState('')
  const [resetBusy,setResetBusy]=useState(false)

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

    const backup:Record<string,unknown>={version:'110.7',exported_at:new Date().toISOString()}
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

  const openReset=(type:ResetType)=>{
    if(!isOwner){
      setMessage('Hanya Owner yang dapat melakukan Reset Data.')
      return
    }
    setMessage('')
    setSuccess('')
    setConfirmation('')
    setResetType(type)
  }

  const executeReset=async(event:FormEvent)=>{
    event.preventDefault()
    if(!resetType)return
    const info=resetInfo[resetType]
    if(confirmation.trim().toUpperCase()!==info.confirm){
      setMessage(`Ketik tepat: ${info.confirm}`)
      return
    }

    setResetBusy(true);setMessage('');setSuccess('')
    const{data,error}=await supabase.rpc('v110_reset_data',{
      p_reset_type:resetType,
      p_confirmation:info.confirm
    })

    if(error){
      setMessage(`Reset gagal: ${error.message}`)
      setResetBusy(false)
      return
    }

    const result=(Array.isArray(data)?data[0]:data) as {
      message?:string
      orders_deleted?:number
      customers_deleted?:number
      services_deleted?:number
      remaining_orders?:number
    }|null

    const deleted=Number(result?.orders_deleted||0)
    const remaining=Number(result?.remaining_orders||0)

    setResetType(null)
    setConfirmation('')
    setResetBusy(false)
    setSuccess(
      result?.message
        ? `${result.message} Order dihapus: ${deleted}. Sisa order: ${remaining}.`
        : `${info.title} berhasil.`
    )

    window.setTimeout(()=>window.location.reload(),1200)
  }

  return <>
    <PageHeader
      eyebrow="KEAMANAN DATA"
      title="Backup & Pemulihan"
      description="Unduh salinan data, pulihkan master data, dan kelola reset data dengan aman."
    />

    <section className="backup-grid">
      <article className="panel backup-card">
        <DatabaseBackup size={30}/>
        <h2>Backup Lengkap JSON</h2>
        <p>Mencakup pelanggan, layanan, order, item order, pembayaran, kas, dan pengaturan.</p>
        <button className="primary-button" onClick={()=>void exportBackup()} disabled={busy}>
          <Download size={17}/>{busy?'Menyiapkan...':'Download Backup'}
        </button>
      </article>

      <article className="panel backup-card">
        <FileUp size={30}/>
        <h2>Import Master Data</h2>
        <p>Memulihkan pelanggan, layanan, dan pengaturan. Transaksi lama tidak ditimpa untuk mencegah duplikasi.</p>
        <label className="secondary-button backup-upload">
          <FileUp size={17}/>Pilih File Backup
          <input type="file" accept=".json,application/json" onChange={e=>void importMaster(e)} disabled={busy}/>
        </label>
      </article>

      <article className="panel backup-card backup-safety">
        <ShieldCheck size={30}/>
        <h2>Aturan Aman</h2>
        <ul>
          <li>Lakukan backup minimal seminggu sekali.</li>
          <li>Download backup sebelum melakukan reset.</li>
          <li>Simpan salinan di dua tempat berbeda.</li>
          <li>Jangan membagikan file backup kepada orang lain.</li>
        </ul>
      </article>
    </section>

    <section className="panel reset-data-panel">
      <div className="reset-data-heading">
        <div className="reset-danger-icon"><ShieldAlert size={24}/></div>
        <div>
          <span className="eyebrow">OWNER ONLY • DANGER ZONE</span>
          <h2>Reset Data</h2>
          <p>Gunakan untuk membersihkan data tertentu. Lakukan <b>Download Backup</b> terlebih dahulu.</p>
        </div>
      </div>

      <div className="reset-data-options">
        <button type="button" onClick={()=>openReset('orders')} disabled={!isOwner}>
          <RotateCcw size={21}/>
          <span><b>Data Order</b><small>Order, pembayaran, item, dan kas terkait order.</small></span>
        </button>

        <button type="button" onClick={()=>openReset('customers')} disabled={!isOwner}>
          <RotateCcw size={21}/>
          <span><b>Data Pelanggan</b><small>Pelanggan + order/transaksi yang bergantung padanya.</small></span>
        </button>

        <button type="button" onClick={()=>openReset('services')} disabled={!isOwner}>
          <RotateCcw size={21}/>
          <span><b>Data Layanan</b><small>Hapus daftar layanan untuk dibuat ulang.</small></span>
        </button>

        <button type="button" className="reset-all-button" onClick={()=>openReset('all')} disabled={!isOwner}>
          <Trash2 size={21}/>
          <span><b>ALL DATA</b><small>Reset seluruh data operasional. Akun login tetap aman.</small></span>
        </button>
      </div>

      {!isOwner&&<div className="reset-owner-note">
        <AlertTriangle size={17}/>Reset Data hanya tersedia untuk akun Owner.
      </div>}
    </section>

    {message&&<div className="error-box inline-message">{message}</div>}
    {success&&<div className="success-box inline-message"><CheckCircle2 size={18}/>{success}</div>}

    {resetType&&<Modal title={resetInfo[resetType].title} onClose={()=>!resetBusy&&setResetType(null)}>
      <form className="modal-form reset-confirm-form" onSubmit={executeReset}>
        <div className={`reset-confirm-warning ${resetType==='all'?'critical':''}`}>
          <AlertTriangle size={28}/>
          <div>
            <b>{resetInfo[resetType].description}</b>
            <span>{resetInfo[resetType].warning}</span>
          </div>
        </div>

        <div className="reset-backup-reminder">
          <DatabaseBackup size={18}/>
          <span>Setelah kode konfirmasi benar, tombol Reset Sekarang akan langsung menjalankan reset.</span>
        </div>

        <label>
          Untuk konfirmasi, ketik:
          <strong className="reset-confirm-code">{resetInfo[resetType].confirm}</strong>
          <input
            value={confirmation}
            onChange={e=>setConfirmation(e.target.value)}
            placeholder={resetInfo[resetType].confirm}
            autoComplete="off"
            disabled={resetBusy}
          />
        </label>

        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={()=>setResetType(null)} disabled={resetBusy}>Batal</button>
          <button
            type="submit"
            className="reset-confirm-button"
            disabled={resetBusy||confirmation.trim().toUpperCase()!==resetInfo[resetType].confirm}
          >
            <Trash2 size={17}/>{resetBusy?'Menghapus...':'Reset Sekarang'}
          </button>
        </div>
      </form>
    </Modal>}
  </>
}
