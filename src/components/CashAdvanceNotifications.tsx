import {useCallback,useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {Bell} from 'lucide-react'
import {useNavigate} from 'react-router-dom'
import {useAuth} from '../lib/auth'
import {canAccess} from '../lib/permissions'
import {supabase} from '../lib/supabase'
import {formatRupiah} from '../lib/format'
import {businessDateTimeLabel} from '../lib/businessTime'
import {Modal} from './Modal'

type Notice={key:string;kind:'addition'|'correction';request_id:string;employee_name:string;amount:number;requester_name:string;status:'pending'|'approved'|'rejected'|'stale';time:string;review_note:string|null}
const labels={pending:'Menunggu persetujuan Owner',approved:'Disetujui',rejected:'Ditolak',stale:'Perlu diajukan ulang'}
export function CashAdvanceNotifications(){
 const {profile}=useAuth(),navigate=useNavigate(),enabled=canAccess(profile,'finance')
 const scope=JSON.stringify([profile?.id,profile?.role,enabled])
 const [state,setState]=useState<{scope:string;rows:Notice[];error:string}>({scope:'',rows:[],error:''})
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),sequence=useRef(0)
 const current=state.scope===scope?state:{scope,rows:[],error:''}
 const load=useCallback(async()=>{
  const seq=++sequence.current
  if(!enabled)return
  try{
   const {data,error}=await supabase.rpc('v113169_cash_advance_notices')
   if(error)throw new Error(error.code==='PGRST202'||error.code==='42883'?'Jalankan SQL 089 untuk mengaktifkan notifikasi kasbon.':error.message)
   if(!data||!Array.isArray(data.rows)||Number(data.count)!==data.rows.length)throw new Error('Notifikasi belum lengkap. Coba muat ulang.')
   if(seq===sequence.current)setState({scope,rows:data.rows as Notice[],error:''})
  }catch(e){if(seq===sequence.current)setState({scope,rows:[],error:e instanceof Error?e.message:String(e)})}
 },[enabled,scope])
 useEffect(()=>{
  setOpen(false);void load()
  const refresh=()=>{if(document.visibilityState!=='hidden')void load()}
  const timer=enabled?window.setInterval(refresh,30000):undefined
  window.addEventListener('focus',refresh);window.addEventListener('happylaundry-data-invalidated',refresh)
  return()=>{++sequence.current;window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('happylaundry-data-invalidated',refresh)}
 },[load,enabled])
 const show=async(n:Notice)=>{
  if(busy)return
  setBusy(true)
  try{
   if(n.status!=='pending'){
    const {error}=await supabase.rpc('v113169_read_cash_advance_notice',{p_key:n.key})
    if(error)throw new Error(error.message)
   }
   setOpen(false)
   navigate(`/finance?kasbon_requests=${n.kind}&kasbon_history=${n.status==='pending'?'0':'1'}&request_id=${encodeURIComponent(n.request_id)}#finance-cash-advance-requests`)
   void load()
  }catch(e){setState(previous=>({...previous,error:e instanceof Error?e.message:String(e)}))}
  finally{setBusy(false)}
 }
 if(!enabled)return null
 return <>
  <button type="button" className="cash-notice-bell icon-button" aria-label={`Notifikasi kasbon${current.rows.length?': '+current.rows.length+' pengajuan':''}`} onClick={()=>{setOpen(true);void load()}}>
   <Bell size={20}/>{(current.rows.length>0||current.error)&&<span className="cash-notice-count">{current.error?'!':current.rows.length>99?'99+':current.rows.length}</span>}
  </button>
  {open&&createPortal(<Modal title="Notifikasi Kasbon" onClose={()=>setOpen(false)}>
   <div className="cash-notices">
    <p>Pengajuan tambahan dan koreksi kasbon. Pilih pemberitahuan untuk membuka rinciannya.</p>
    {current.error&&<div className="error-box" role="alert">{current.error}</div>}
    <button type="button" className="secondary-button" disabled={busy} onClick={()=>void load()}>Muat Ulang Notifikasi</button>
    {!current.error&&current.rows.length===0&&<p>Tidak ada notifikasi kasbon yang perlu ditindaklanjuti.</p>}
    {current.rows.map(n=><button type="button" className="cash-notice-item" key={n.key} disabled={busy} onClick={()=>void show(n)}>
     <span>{n.kind==='addition'?'Pengajuan Tambahan Kasbon':'Pengajuan Koreksi Kasbon'} • {n.employee_name}</span>
     <span>{labels[n.status]} • {formatRupiah(Number(n.amount))}</span>
     <small>{n.requester_name} • {businessDateTimeLabel(n.time)}</small>
     {n.review_note&&<small>{n.review_note}</small>}
    </button>)}
   </div>
  </Modal>,document.body)}
 </>
}
