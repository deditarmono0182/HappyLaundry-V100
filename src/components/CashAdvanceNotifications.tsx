import {useCallback,useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {Bell,HandCoins,FilePenLine,ShieldAlert} from 'lucide-react'
import {RequestSoundButton,playRequestSound} from '../lib/requestSound'
import {useNavigate} from 'react-router-dom'
import {useAuth} from '../lib/auth'
import {canAccess} from '../lib/permissions'
import {supabase} from '../lib/supabase'
import {formatRupiah} from '../lib/format'
import {businessDateTimeLabel} from '../lib/businessTime'
import {Modal} from './Modal'

type Notice={key:string;kind:'addition'|'correction'|'deletion';request_id:string;employee_name:string;amount:number;requester_name:string;status:'pending'|'approved'|'rejected'|'stale';time:string;review_note:string|null}
const labels={pending:'Menunggu persetujuan Owner',approved:'Disetujui',rejected:'Ditolak',stale:'Perlu diajukan ulang'}
const titles={addition:'Tambahan Kasbon',correction:'Koreksi Kasbon',deletion:'Permintaan Penghapusan'}
const identity=(n:Notice)=>n.key+':'+n.status
function readSeen(key:string):string[]{try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value.filter(x=>typeof x==='string'):[]}catch{return []}}
export function CashAdvanceNotifications(){
 const {profile}=useAuth(),navigate=useNavigate(),finance=canAccess(profile,'finance'),owner=profile?.role==='owner',enabled=finance||owner
 const scope=JSON.stringify([profile?.id,profile?.role,finance]),storageKey=`happylaundry-notices-read:${profile?.id}`
 const [state,setState]=useState<{scope:string;rows:Notice[];error:string}>({scope:'',rows:[],error:''})
 const [read,setRead]=useState<{scope:string;keys:string[]}>({scope:'',keys:[]})
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),sequence=useRef(0)
 const previous=useRef<{scope:string;keys:Set<string>}>({scope:'',keys:new Set()})
 const current=state.scope===scope?state:{scope,rows:[],error:''}
 const readKeys=read.scope===scope?read.keys:readSeen(storageKey)
 const unread=current.rows.filter(n=>!readKeys.includes(identity(n))).length
 const markRead=(keys:string[])=>{const next=Array.from(new Set([...readKeys,...keys])).slice(-3000);setRead({scope,keys:next});try{localStorage.setItem(storageKey,JSON.stringify(next))}catch{}}
 const load=useCallback(async()=>{
  const seq=++sequence.current
  if(!enabled)return
  const cash=async():Promise<Notice[]>=>{
   if(!finance)return []
   const {data,error}=await supabase.rpc('v113169_cash_advance_notices')
   if(error)throw new Error(error.code==='PGRST202'||error.code==='42883'?'Jalankan SQL 089 untuk mengaktifkan notifikasi kasbon.':error.message)
   if(!data||!Array.isArray(data.rows)||Number(data.count)!==data.rows.length)throw new Error('Notifikasi kasbon belum lengkap. Coba muat ulang.')
   return data.rows as Notice[]
  }
  const deletion=async():Promise<Notice[]>=>{
   if(!owner)return []
   const {data,error}=await supabase.from('v11306_delete_requests').select('id,entity_label,reason,requested_by_name,requested_at').eq('status','pending').order('requested_at',{ascending:false})
   if(error)throw new Error('Pemberitahuan penghapusan: '+error.message)
   return (data||[]).map(row=>({key:'deletion:'+row.id,kind:'deletion',request_id:row.id,employee_name:row.entity_label,amount:0,requester_name:row.requested_by_name||'Karyawan',status:'pending',time:row.requested_at,review_note:row.reason}))
  }
  const results=await Promise.allSettled([cash(),deletion()])
  if(seq!==sequence.current)return
  const rows=results.flatMap(r=>r.status==='fulfilled'?r.value:[]).sort((a,b)=>new Date(b.time).getTime()-new Date(a.time).getTime())
  const error=results.flatMap(r=>r.status==='rejected'?[r.reason instanceof Error?r.reason.message:String(r.reason)]:[]).join(' ')
  const keys=new Set(rows.map(identity))
  if(previous.current.scope===scope&&rows.some(n=>!previous.current.keys.has(identity(n))))playRequestSound()
  // Preserve previous source keys on a partial failure to avoid replaying alerts after recovery.
  if(!error)previous.current={scope,keys}
  setState({scope,rows,error})
 },[enabled,finance,owner,scope])
 useEffect(()=>{
  setOpen(false);setRead({scope,keys:readSeen(storageKey)});void load()
  const refresh=()=>{if(document.visibilityState!=='hidden')void load()}
  const timer=enabled?window.setInterval(refresh,30000):undefined
  const events=['focus','happylaundry-data-invalidated','happylaundry-delete-requests-changed']
  events.forEach(event=>window.addEventListener(event,refresh))
  return()=>{++sequence.current;window.clearInterval(timer);events.forEach(event=>window.removeEventListener(event,refresh))}
 },[load,enabled,scope,storageKey])
 const show=async(n:Notice)=>{
  if(busy)return
  setBusy(true)
  try{
   if(n.kind!=='deletion'&&n.status!=='pending'){
    const {error}=await supabase.rpc('v113169_read_cash_advance_notice',{p_key:n.key})
    if(error)throw new Error(error.message)
   }
   markRead([identity(n)]);setOpen(false)
   navigate(n.kind==='deletion'?`/delete-approvals?request_id=${encodeURIComponent(n.request_id)}`:`/finance?kasbon_requests=${n.kind}&kasbon_history=${n.status==='pending'?'0':'1'}&request_id=${encodeURIComponent(n.request_id)}#finance-cash-advance-requests`)
   void load()
  }catch(e){setState(p=>({...p,error:e instanceof Error?e.message:String(e)}))}
  finally{setBusy(false)}
 }
 if(!enabled)return null
 return <>
  <button type="button" className="cash-notice-bell icon-button" title="Pemberitahuan" aria-label={`Pemberitahuan: ${unread} belum dibaca`} onClick={()=>{setOpen(true);void load()}}><Bell size={20}/>{unread>0&&<span className="cash-notice-count">{unread>99?'99+':unread}</span>}{current.error&&<span className="cash-notice-error" aria-label="Sebagian pemberitahuan gagal dimuat">!</span>}</button>
  {open&&createPortal(<Modal title="Pemberitahuan" onClose={()=>setOpen(false)}>
   <div className="cash-notices">
    <div className="notification-toolbar"><span>{unread} belum dibaca</span><RequestSoundButton/><button type="button" className="secondary-button" disabled={!unread||busy} onClick={()=>markRead(current.rows.map(identity))}>Tandai dibaca</button><button type="button" className="secondary-button" onClick={()=>void load()}>Muat Ulang</button></div>
    <small>Aktifkan ikon suara untuk nada saat ada pemberitahuan baru selama aplikasi terbuka. Membaca pemberitahuan tidak menyetujui permintaan.</small>
    {current.error&&<div className="error-box" role="alert">{current.error}</div>}
    {!current.error&&current.rows.length===0&&<p>Belum ada pemberitahuan.</p>}
    {current.rows.map(n=>{const isNew=!readKeys.includes(identity(n)),Icon=n.kind==='addition'?HandCoins:n.kind==='correction'?FilePenLine:ShieldAlert;return <button type="button" className={`cash-notice-item ${isNew?'notice-unread':''}`} key={identity(n)} disabled={busy} onClick={()=>void show(n)}>
     <span className="notice-kind"><Icon size={18}/>{titles[n.kind]}{isNew&&<span className="badge">Baru</span>}</span>
     <span>{n.employee_name}</span><span>{labels[n.status]}{n.kind!=='deletion'&&` • ${formatRupiah(Number(n.amount))}`}</span>
     <small>{n.requester_name} • {businessDateTimeLabel(n.time)}</small>{n.review_note&&<small>{n.review_note}</small>}
    </button>})}
   </div>
  </Modal>,document.body)}
 </>
}
