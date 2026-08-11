import { ChangeEvent, useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, DatabaseBackup, Download, FileUp, History,
  LockKeyhole, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, Trash2
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

interface SafetySnapshot {
  id:number
  label:string
  created_at:string
  created_by:string|null
  customer_count:number
  service_count:number
  order_count:number
  payment_count:number
  cash_count:number
}

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
  const [selectedReset,setSelectedReset]=useState<ResetType|null>(null)
  const [confirmation,setConfirmation]=useState('')
  const [resetBusy,setResetBusy]=useState(false)
  const [resetStatus,setResetStatus]=useState('')
  const [resetResult,setResetResult]=useState('')
  const [snapshots,setSnapshots]=useState<SafetySnapshot[]>([])
  const [snapshotBusy,setSnapshotBusy]=useState(false)
  const [restoreTarget,setRestoreTarget]=useState<SafetySnapshot|null>(null)
  const [restoreConfirm,setRestoreConfirm]=useState('')
  const [restoreBusy,setRestoreBusy]=useState(false)
  const [orderDiagnostic,setOrderDiagnostic]=useState<{
    table_count:number
    view_count:number
    rpc_version?:string
  }|null>(null)


  const loadSafetySnapshots=useCallback(async()=>{
    if(!isOwner){setSnapshots([]);return}
    const {data,error}=await supabase.rpc('v113037_list_safety_snapshots')
    if(error){
      setMessage(`Riwayat Safety Snapshot gagal dimuat: ${error.message}`)
      return
    }
    setSnapshots(((data||[]) as SafetySnapshot[]))
  },[isOwner])

  useEffect(()=>{void loadSafetySnapshots()},[loadSafetySnapshots])

  const createSafetySnapshot=async()=>{
    if(!isOwner){setMessage('Hanya Owner yang dapat membuat Safety Snapshot.');return}
    setSnapshotBusy(true);setMessage('');setSuccess('')
    const {data,error}=await supabase.rpc('v113037_create_safety_snapshot',{
      p_label:`Manual • ${new Date().toLocaleString('id-ID')}`
    })
    if(error)setMessage(`Safety Snapshot gagal: ${error.message}`)
    else{
      setSuccess(`Safety Snapshot #${data} berhasil dibuat.`)
      await loadSafetySnapshots()
    }
    setSnapshotBusy(false)
  }

  const openRestore=(snapshot:SafetySnapshot)=>{
    if(!isOwner){setMessage('Hanya Owner yang dapat melakukan Restore.');return}
    setRestoreTarget(snapshot)
    setRestoreConfirm('')
    setMessage('')
    setSuccess('')
  }

  const executeRestore=async()=>{
    if(!restoreTarget)return
    const phrase=`RESTORE SNAPSHOT ${restoreTarget.id}`
    if(restoreConfirm.trim().toUpperCase()!==phrase){
      setMessage(`Ketik tepat: ${phrase}`)
      return
    }
    if(!window.confirm(
      `RESTORE SNAPSHOT #${restoreTarget.id}?\n\nSistem akan membuat snapshot data SAAT INI terlebih dahulu, lalu mengganti data operasional dengan isi snapshot yang dipilih.`
    ))return

    setRestoreBusy(true);setMessage('');setSuccess('')
    const {data,error}=await supabase.rpc('v113037_restore_safety_snapshot',{
      p_snapshot_id:restoreTarget.id,
      p_confirmation:phrase
    })
    if(error){
      setMessage(`RESTORE GAGAL: ${error.message}`)
    }else{
      const result=(Array.isArray(data)?data[0]:data) as {
        restored_snapshot_id?:number
        pre_restore_snapshot_id?:number
        orders_restored?:number
        message?:string
      }|null
      setSuccess(
        `${result?.message||'Restore berhasil.'} Snapshot pengaman sebelum restore: #${result?.pre_restore_snapshot_id||'-'}.`
      )
      setRestoreTarget(null)
      setRestoreConfirm('')
      await loadSafetySnapshots()
    }
    setRestoreBusy(false)
  }

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
    setSelectedReset(type)
    setConfirmation('')
    setResetResult('')
    setMessage('')
    setSuccess('')
  }

  const checkOrderCount=async()=>{
    setMessage('')
    setSuccess('')
    setResetStatus('Memeriksa jumlah order di Supabase...')
    const{data,error}=await supabase.rpc('v110_order_reset_diagnostic')
    setResetStatus('')
    if(error){
      setMessage(`Cek data gagal: ${error.message}`)
      return
    }
    const result=(Array.isArray(data)?data[0]:data) as {
      table_count?:number
      view_count?:number
      rpc_version?:string
    }|null
    setOrderDiagnostic({
      table_count:Number(result?.table_count||0),
      view_count:Number(result?.view_count||0),
      rpc_version:result?.rpc_version
    })
  }

  const executeSelectedReset=async()=>{
    if(!selectedReset)return
    const info=resetInfo[selectedReset]

    if(!isOwner){
      setResetResult('Hanya Owner yang dapat melakukan Reset Data.')
      return
    }

    if(confirmation.trim().toUpperCase()!==info.confirm){
      setResetResult(`Ketik tepat: ${info.confirm}`)
      return
    }

    setResetBusy(true)
    setResetStatus(`Menjalankan ${info.title}...`)
    setResetResult('')
    setMessage('')
    setSuccess('')

    const{data,error}=await supabase.rpc('v110_reset_data_v5',{
      p_reset_type:selectedReset,
      p_confirmation:info.confirm
    })

    setResetStatus('')

    if(error){
      setResetBusy(false)
      setResetResult(`RESET GAGAL: ${error.message}`)
      return
    }

    const result=(Array.isArray(data)?data[0]:data) as {
      message?:string
      orders_deleted?:number
      customers_deleted?:number
      services_deleted?:number
      table_count?:number
      view_count?:number
      rpc_version?:string
    }|null

    if(selectedReset==='orders'||selectedReset==='customers'||selectedReset==='all'){
      setOrderDiagnostic({
        table_count:Number(result?.table_count||0),
        view_count:Number(result?.view_count||0),
        rpc_version:result?.rpc_version||'110.7.5'
      })
    }

    const parts=[
      result?.message||'Reset berhasil.',
      Number(result?.orders_deleted||0)>0?`Order: ${Number(result?.orders_deleted||0)}`:'',
      Number(result?.customers_deleted||0)>0?`Pelanggan: ${Number(result?.customers_deleted||0)}`:'',
      Number(result?.services_deleted||0)>0?`Layanan: ${Number(result?.services_deleted||0)}`:''
    ].filter(Boolean)

    setResetBusy(false)
    setResetResult(parts.join(' • '))
    setConfirmation('')
  }


  return <>
    <PageHeader
      eyebrow="KEAMANAN DATA"
      title="Backup & Pemulihan"
      description="Unduh salinan data, pulihkan master data, dan kelola reset data dengan aman."
    />

    <div className="backup-version-badge">Versi Reset Aktif: <b>V110.7.5</b></div>

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

    {isOwner&&<section className="panel safety-snapshot-panel">
      <div className="safety-snapshot-heading">
        <div>
          <span className="eyebrow">PRODUCTION SAFETY • OWNER ONLY</span>
          <h2><DatabaseBackup size={20}/> Safety Snapshot & Restore</h2>
          <p>Snapshot menyimpan data inti operasional. Sebelum Restore, sistem otomatis membuat snapshot kondisi terbaru.</p>
        </div>
        <div className="safety-snapshot-actions">
          <button type="button" className="secondary-button" onClick={()=>void loadSafetySnapshots()} disabled={snapshotBusy||restoreBusy}>
            <RefreshCw size={16}/> Refresh
          </button>
          <button type="button" className="primary-button" onClick={()=>void createSafetySnapshot()} disabled={snapshotBusy||restoreBusy}>
            <DatabaseBackup size={16}/>{snapshotBusy?'Membuat...':'Buat Snapshot Sekarang'}
          </button>
        </div>
      </div>

      <div className="safety-snapshot-warning">
        <ShieldCheck size={18}/>
        <span><b>Restore aman berlapis.</b> Data saat ini diamankan terlebih dahulu sebelum snapshot lama dipulihkan.</span>
      </div>

      <div className="table-wrap safety-snapshot-table">
        <table>
          <thead><tr><th>ID</th><th>Label</th><th>Dibuat</th><th>Pelanggan</th><th>Layanan</th><th>Order</th><th>Pembayaran</th><th>Kas</th><th/></tr></thead>
          <tbody>
            {snapshots.length===0&&<tr><td colSpan={9} className="table-empty">Belum ada Safety Snapshot.</td></tr>}
            {snapshots.map(row=><tr key={row.id}>
              <td><b>#{row.id}</b></td>
              <td>{row.label}</td>
              <td>{new Date(row.created_at).toLocaleString('id-ID')}</td>
              <td>{row.customer_count}</td>
              <td>{row.service_count}</td>
              <td>{row.order_count}</td>
              <td>{row.payment_count}</td>
              <td>{row.cash_count}</td>
              <td>
                <button type="button" className="secondary-button snapshot-restore-button" onClick={()=>openRestore(row)} disabled={restoreBusy}>
                  <History size={15}/> Restore
                </button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>

      {restoreTarget&&<div className="restore-confirm-box">
        <div className="restore-confirm-title">
          <LockKeyhole size={22}/>
          <div>
            <b>Restore Safety Snapshot #{restoreTarget.id}</b>
            <span>{restoreTarget.label} • {new Date(restoreTarget.created_at).toLocaleString('id-ID')}</span>
          </div>
        </div>
        <p>Restore akan mengganti data pelanggan, layanan, order, item order, pembayaran, dan kas dengan isi snapshot ini.</p>
        <label>
          Untuk konfirmasi ketik
          <strong>RESTORE SNAPSHOT {restoreTarget.id}</strong>
          <input
            value={restoreConfirm}
            onChange={e=>setRestoreConfirm(e.target.value)}
            placeholder={`RESTORE SNAPSHOT ${restoreTarget.id}`}
            disabled={restoreBusy}
            autoComplete="off"
          />
        </label>
        <div className="restore-confirm-actions">
          <button type="button" className="secondary-button" onClick={()=>{setRestoreTarget(null);setRestoreConfirm('')}} disabled={restoreBusy}>Batal</button>
          <button
            type="button"
            className="restore-danger-button"
            onClick={()=>void executeRestore()}
            disabled={restoreBusy||restoreConfirm.trim().toUpperCase()!==`RESTORE SNAPSHOT ${restoreTarget.id}`}
          >
            <History size={16}/>{restoreBusy?'Memulihkan...':'RESTORE SNAPSHOT'}
          </button>
        </div>
      </div>}
    </section>}

    <section className="panel reset-diagnostic-panel">
      <div>
        <b>Diagnostic Order</b>
        <span>Cek jumlah order langsung dari database sebelum atau sesudah reset.</span>
      </div>
      <div className="reset-diagnostic-actions">
        <button type="button" className="secondary-button" onClick={()=>void checkOrderCount()} disabled={resetBusy}>
          Cek Jumlah Order
        </button>
      </div>

      {orderDiagnostic&&<div className="reset-diagnostic-values">
        <span>Tabel v100_orders <b>{orderDiagnostic.table_count}</b></span>
        <span>View v100_orders_view <b>{orderDiagnostic.view_count}</b></span>
        <span>RPC <b>{orderDiagnostic.rpc_version||'-'}</b></span>
      </div>}
    </section>

    <section className="panel reset-data-panel">
      <div className="reset-data-heading">
        <div className="reset-danger-icon"><ShieldAlert size={24}/></div>
        <div>
          <span className="eyebrow">OWNER ONLY • DANGER ZONE</span>
          <h2>Reset Data</h2>
          <p>Pilih data yang ingin dibersihkan. <b>Download Backup</b> terlebih dahulu.</p>
        </div>
      </div>

      <div className="reset-data-options">
        <button
          type="button"
          className={selectedReset==='orders'?'selected':''}
          onClick={()=>openReset('orders')}
          disabled={!isOwner||resetBusy}
        >
          <RotateCcw size={21}/>
          <span><b>Data Order</b><small>Order, pembayaran, item, dan kas terkait order.</small></span>
        </button>

        <button
          type="button"
          className={selectedReset==='customers'?'selected':''}
          onClick={()=>openReset('customers')}
          disabled={!isOwner||resetBusy}
        >
          <RotateCcw size={21}/>
          <span><b>Data Pelanggan</b><small>Pelanggan + order/transaksi yang bergantung padanya.</small></span>
        </button>

        <button
          type="button"
          className={selectedReset==='services'?'selected':''}
          onClick={()=>openReset('services')}
          disabled={!isOwner||resetBusy}
        >
          <RotateCcw size={21}/>
          <span><b>Data Layanan</b><small>Hapus daftar layanan untuk dibuat ulang.</small></span>
        </button>

        <button
          type="button"
          className={`reset-all-button ${selectedReset==='all'?'selected':''}`}
          onClick={()=>openReset('all')}
          disabled={!isOwner||resetBusy}
        >
          <Trash2 size={21}/>
          <span><b>ALL DATA</b><small>Reset seluruh data operasional. Akun login tetap aman.</small></span>
        </button>
      </div>

      {selectedReset&&<div className={`reset-inline-confirm ${selectedReset==='all'?'critical':''}`}>
        <div className="reset-inline-info">
          <AlertTriangle size={24}/>
          <div>
            <b>{resetInfo[selectedReset].title}</b>
            <span>{resetInfo[selectedReset].description}</span>
            <small>{resetInfo[selectedReset].warning}</small>
          </div>
        </div>

        <label>
          Untuk konfirmasi ketik
          <strong>{resetInfo[selectedReset].confirm}</strong>
          <input
            value={confirmation}
            onChange={e=>setConfirmation(e.target.value)}
            placeholder={resetInfo[selectedReset].confirm}
            autoComplete="off"
            disabled={resetBusy}
          />
        </label>

        {resetStatus&&<div className="reset-running-status">{resetStatus}</div>}
        {resetResult&&<div className={`direct-reset-message ${resetResult.startsWith('RESET GAGAL')?'error':''}`}>
          {resetResult}
        </div>}

        <div className="reset-inline-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={()=>{
              setSelectedReset(null)
              setConfirmation('')
              setResetResult('')
            }}
            disabled={resetBusy}
          >
            Batal
          </button>
          <button
            type="button"
            className="reset-confirm-button"
            onClick={()=>void executeSelectedReset()}
            disabled={resetBusy||confirmation.trim().toUpperCase()!==resetInfo[selectedReset].confirm}
          >
            <Trash2 size={17}/>{resetBusy?'Menghapus...':'RESET SEKARANG'}
          </button>
        </div>
      </div>}

      {!isOwner&&<div className="reset-owner-note">
        <AlertTriangle size={17}/>Reset Data hanya tersedia untuk akun Owner.
      </div>}
    </section>

    {message&&<div className="error-box inline-message">{message}</div>}
    {success&&<div className="success-box inline-message"><CheckCircle2 size={18}/>{success}</div>}
  </>
}
