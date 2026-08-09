import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock3, FileWarning, RefreshCw, ShoppingBag, Trash2, XCircle } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../lib/auth'
import { formatRupiah } from '../lib/format'
import { supabase } from '../lib/supabase'

interface DeleteRequest{
  id:string
  entity_type:'order'|'expense'
  entity_id:string
  entity_label:string
  reason:string
  status:'pending'|'approved'|'rejected'
  requested_by_name:string|null
  requested_at:string
  snapshot:Record<string,unknown>|null
}

const removeReturnedFiles=async(result:any)=>{
  const files=Array.isArray(result?.files)?result.files:[]
  const grouped=new Map<string,string[]>()
  for(const file of files){
    if(!file?.bucket||!file?.path)continue
    const list=grouped.get(file.bucket)||[]
    list.push(file.path)
    grouped.set(file.bucket,list)
  }
  for(const [bucket,paths] of grouped){
    try{await supabase.storage.from(bucket).remove(paths)}catch{}
  }
}

export function DeleteApprovalsPage(){
  const {profile}=useAuth()
  const [rows,setRows]=useState<DeleteRequest[]>([])
  const [loading,setLoading]=useState(true)
  const [busyId,setBusyId]=useState<string|null>(null)
  const [message,setMessage]=useState('')
  const [success,setSuccess]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const {data,error}=await supabase
      .from('v11306_delete_requests')
      .select('id,entity_type,entity_id,entity_label,reason,status,requested_by_name,requested_at,snapshot')
      .eq('status','pending')
      .order('requested_at',{ascending:true})
    if(error)setMessage(error.message)
    else setRows((data as DeleteRequest[])||[])
    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  if(profile?.role!=='owner'){
    return <section className="panel delete-approval-owner-only">
      <FileWarning size={24}/>
      <div><b>Persetujuan Hapus khusus Owner</b><span>Karyawan hanya dapat mengajukan permintaan penghapusan.</span></div>
    </section>
  }

  const approve=async(row:DeleteRequest)=>{
    const phrase=row.entity_type==='order'?'HAPUS ORDER':'HAPUS PENGELUARAN'
    const typed=window.prompt(
      `${row.entity_label}\n\nAlasan: ${row.reason}\n\nUntuk MENYETUJUI penghapusan, ketik:\n${phrase}`
    )
    if(typed!==phrase)return

    setBusyId(row.id);setMessage('');setSuccess('')
    const {data,error}=await supabase.rpc('v11306_review_delete_request',{
      p_request_id:row.id,
      p_approve:true,
      p_review_note:'Disetujui Owner'
    })
    if(error)setMessage(error.message)
    else{
      await removeReturnedFiles(data)
      setSuccess(`${row.entity_label} berhasil dihapus setelah persetujuan Owner.`)
      await load()
      window.dispatchEvent(new Event('happylaundry-delete-requests-changed'))
    }
    setBusyId(null)
  }

  const reject=async(row:DeleteRequest)=>{
    const note=window.prompt(`Alasan menolak permintaan hapus ${row.entity_label}:`,'Data tetap dipertahankan.')
    if(note===null)return
    setBusyId(row.id);setMessage('');setSuccess('')
    const {error}=await supabase.rpc('v11306_review_delete_request',{
      p_request_id:row.id,
      p_approve:false,
      p_review_note:note
    })
    if(error)setMessage(error.message)
    else{
      setSuccess(`Permintaan hapus ${row.entity_label} ditolak.`)
      await load()
      window.dispatchEvent(new Event('happylaundry-delete-requests-changed'))
    }
    setBusyId(null)
  }

  return <>
    <PageHeader
      eyebrow="OWNER • AUDIT"
      title="Persetujuan Hapus"
      description="Setujui atau tolak permintaan penghapusan Order dan Pengeluaran."
      action={<button type="button" className="secondary-button" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button>}
    />

    {message&&<div className="error-box inline-message">{message}</div>}
    {success&&<div className="success-box inline-message"><CheckCircle2 size={17}/>{success}</div>}

    <section className="panel delete-approval-panel">
      <div className="delete-approval-head">
        <div><b>Menunggu Persetujuan</b><small>Penghapusan belum dilakukan sebelum Owner menyetujui.</small></div>
        <span>{rows.length} permintaan</span>
      </div>

      {loading&&<div className="table-empty">Memuat permintaan...</div>}
      {!loading&&rows.length===0&&<div className="delete-approval-empty"><CheckCircle2 size={30}/><b>Tidak ada permintaan hapus.</b></div>}

      <div className="delete-approval-list">
        {rows.map(row=>{
          const snap=row.snapshot||{}
          return <article className="delete-approval-card" key={row.id}>
            <div className={`delete-approval-icon ${row.entity_type}`}>
              {row.entity_type==='order'?<ShoppingBag size={20}/>:<Trash2 size={20}/>}
            </div>
            <div className="delete-approval-info">
              <div className="delete-approval-title">
                <b>{row.entity_label}</b>
                <span>{row.entity_type==='order'?'ORDER':'PENGELUARAN'}</span>
              </div>
              <small><Clock3 size={12}/>{new Date(row.requested_at).toLocaleString('id-ID')} • oleh {row.requested_by_name||'Pengguna'}</small>
              <p><b>Alasan:</b> {row.reason}</p>
              {row.entity_type==='order'&&<div className="delete-snapshot">
                <span>Pelanggan <b>{String(snap.customer_name||'-')}</b></span>
                <span>Total <b>{formatRupiah(Number(snap.total||0))}</b></span>
                <span>Status <b>{String(snap.status||'-')}</b></span>
              </div>}
              {row.entity_type==='expense'&&<div className="delete-snapshot">
                <span>Kategori <b>{String(snap.category_name||'-')}</b></span>
                <span>Nominal <b>{formatRupiah(Number(snap.amount||0))}</b></span>
                <span>Tanggal <b>{String(snap.expense_date||'-')}</b></span>
              </div>}
            </div>
            <div className="delete-approval-actions">
              <button type="button" className="secondary-button delete-reject" disabled={busyId===row.id} onClick={()=>void reject(row)}><XCircle size={15}/>Tolak</button>
              <button type="button" className="danger-button" disabled={busyId===row.id} onClick={()=>void approve(row)}><Trash2 size={15}/>{busyId===row.id?'Memproses...':'Setujui Hapus'}</button>
            </div>
          </article>
        })}
      </div>
    </section>
  </>
}
