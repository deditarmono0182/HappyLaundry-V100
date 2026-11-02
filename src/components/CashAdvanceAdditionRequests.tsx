import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react'
import {Modal} from './Modal'
import {CashAdvanceWarning} from './CashAdvanceWarning'
import {useCashAdvanceLimit} from '../lib/cashAdvanceLimit'
import {supabase} from '../lib/supabase'
import {formatRupiah} from '../lib/format'
import {businessDateTimeLabel} from '../lib/businessTime'

export type AdditionDraft={employee_id:string;amount:string;payment_method:string;note:string}
type Employee={id:string;full_name:string;login_id:string}
type Request={id:string;employee_id:string;employee_name:string;amount:number;payment_method:string;note:string|null;reason:string;status:'pending'|'approved'|'rejected';requested_at:string;requester_name:string;reviewer_name:string|null;reviewed_at:string|null;review_note:string|null;cash_advance_id:string|null;capacity_at_request:{salary_available:number;outstanding:number;payroll_month:string}}
const labels={pending:'Menunggu Owner',approved:'Disetujui',rejected:'Ditolak'}
const methods:Record<string,string>={cash:'Tunai',transfer:'Transfer',qris:'QRIS',other:'Lainnya'}
const empty: AdditionDraft={employee_id:'',amount:'',payment_method:'cash',note:''}
const message=(e:unknown)=>e instanceof Error?e.message:String((e as {message?:string})?.message||e)

export function CashAdvanceAdditionRequestModal({initial,onClose,onSent}:{initial?:AdditionDraft;onClose:()=>void;onSent:()=>Promise<void>}){
 const [form,setForm]=useState(()=>({...empty,...initial,reason:''})),[employees,setEmployees]=useState<Employee[]>([])
 const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const sending=useRef(false),retry=useRef<{key:string;id:string}|null>(null)
 const limit=useCashAdvanceLimit(form.employee_id,true)
 useEffect(()=>{let active=true;void(async()=>{try{
  const r=await supabase.rpc('v113122_finance_list_employees');if(r.error)throw r.error
  if(!Array.isArray(r.data))throw new Error('Daftar karyawan tidak valid')
  if(active)setEmployees(r.data as Employee[])
 }catch(e){if(active)setLoadError(message(e))}finally{if(active)setLoading(false)}})();return()=>{active=false}},[])
 const send=async(event:FormEvent)=>{
  event.preventDefault();if(sending.current)return
  const amount=Number(form.amount),reason=form.reason.trim()
  if(!employees.some(e=>e.id===form.employee_id)||!Number.isFinite(amount)||amount<=0||amount>999999999999.99||Math.abs(Math.round(amount*100)-amount*100)>0.000001){setError('Pilih karyawan aktif dan nominal yang valid (maksimal 2 angka desimal).');return}
  if(reason.length<5){setError('Alasan pengajuan minimal 5 karakter.');return}
  if(limit.loading||limit.error||!limit.limit){setError('Muat ulang batas kasbon sebelum mengirim pengajuan.');return}
  const args={p_employee_id:form.employee_id,p_amount:amount,p_payment_method:form.payment_method,p_note:form.note.trim()||null,p_reason:reason}
  const key=JSON.stringify(args);if(retry.current?.key!==key)retry.current={key,id:crypto.randomUUID()}
  sending.current=true;setBusy(true);setError('')
  try{
   const r=await supabase.rpc('v113163_request_additional_cash_advance',{...args,p_request_id:retry.current.id})
   if(r.error)throw r.error
  }catch(e){setError(`Pengajuan belum dapat dikonfirmasi. ${message(e)}. Jika fungsi tidak ditemukan, jalankan SQL 085. Coba kirim ulang tanpa mengubah isian untuk memeriksa pengajuan yang sama.`);sending.current=false;setBusy(false);return}
  // The request is committed. Refresh failures must not offer a second request.
  try{await onSent()}finally{onClose();sending.current=false;setBusy(false)}
 }
 return <Modal title="Ajukan Tambahan Kasbon" onClose={()=>!busy&&onClose()}><form className="modal-form" onSubmit={send}>
  <div className="info-box">Pengajuan menunggu persetujuan Owner. Saldo kasbon dan Kas Harian belum berubah. Jangan berikan uang sebelum Owner menyetujui.</div>
  {loading&&<p role="status">Memuat karyawan...</p>}{loadError&&<div className="error-box">{loadError}. Tutup lalu buka kembali formulir.</div>}
  <label>Karyawan<select aria-label="Karyawan Pengajuan Kasbon" value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})} disabled={busy||loading} required><option value="">Pilih karyawan</option>{employees.map(e=><option key={e.id} value={e.id}>{e.full_name} — {e.login_id}</option>)}</select></label>
  <label>Nominal Tambahan Kasbon<input type="number" min="0.01" max="999999999999.99" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} disabled={busy} required/></label>
  {form.employee_id&&<CashAdvanceWarning state={limit} amount={Number(form.amount)} owner={false} reason="" onReason={()=>{}} onRefresh={limit.refresh} requestAllowed/>}
  <label>Rencana Pemberian Melalui<select aria-label="Metode Pemberian Kasbon" value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})} disabled={busy}>{Object.entries(methods).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <label>Keterangan Kasbon<textarea value={form.note} onChange={e=>setForm({...form,note:e.target.value})} disabled={busy}/></label>
  <label>Alasan Pengajuan<textarea minLength={5} required value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} disabled={busy}/></label>
  {error&&<div role="alert" className="error-box">{error}</div>}
  <div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Batal</button><button className="primary-button" disabled={busy||loading||!!loadError||!form.employee_id||!limit.limit||limit.loading||!!limit.error}>{busy?'Mengirim...':'Kirim ke Owner'}</button></div>
 </form></Modal>
}

function AdditionReview({request,onClose,onDecided}:{request:Request;onClose:()=>void;onDecided:(approved:boolean)=>Promise<void>}){
 const [note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),sending=useRef(false)
 const limit=useCashAdvanceLimit(request.employee_id,true)
 const decide=async(approve:boolean)=>{
  if(sending.current)return
  if(note.trim().length<5){setError('Catatan keputusan minimal 5 karakter.');return}
  if(approve&&(limit.loading||limit.error||!limit.limit)){setError('Periksa batas gaji terbaru sebelum menyetujui.');return}
  sending.current=true;setBusy(true);setError('')
  try{
   const r=await supabase.rpc('v113163_review_additional_cash_advance',{p_request_id:request.id,p_approve:approve,p_review_note:note.trim()})
   if(r.error)throw r.error
  }catch(e){setError(message(e));sending.current=false;setBusy(false);return}
  try{await onDecided(approve)}finally{onClose();sending.current=false;setBusy(false)}
 }
 return <Modal title={`Tinjau Tambahan Kasbon — ${request.employee_name}`} onClose={()=>!busy&&onClose()}><div className="modal-form">
  <p>Tambahan kasbon: {formatRupiah(Number(request.amount))}<br/>Metode: {methods[request.payment_method]||request.payment_method}<br/>Pengaju: {request.requester_name}</p>
  <p className="cash-correction-request-reason">Alasan: {request.reason}<br/>Keterangan: {request.note||'—'}</p>
  <small>Saat diajukan ({request.capacity_at_request.payroll_month.slice(0,7)}): gaji tersedia {formatRupiah(Number(request.capacity_at_request.salary_available))}, sisa kasbon {formatRupiah(Number(request.capacity_at_request.outstanding))}.</small>
  <CashAdvanceWarning state={limit} amount={Number(request.amount)} owner reason={note} onReason={setNote} onRefresh={limit.refresh} showReason={false}/>
  <div className="warning-box">Setujui saat dana diberikan sesuai metode di atas. Persetujuan langsung membuat kasbon baru dan Kas Keluar di Kas Harian. Tidak ada transfer bank otomatis. Gaji dan potongan kasbon tidak diubah.</div>
  <label>Catatan Keputusan Owner<textarea minLength={5} value={note} onChange={e=>setNote(e.target.value)} disabled={busy}/></label>
  {error&&<div role="alert" className="error-box">{error}</div>}
  <div className="form-actions"><button className="secondary-button" disabled={busy} onClick={onClose}>Batal</button><button className="secondary-button" disabled={busy} onClick={()=>void decide(false)}>Tolak Pengajuan</button><button className="primary-button" disabled={busy||limit.loading||!!limit.error||!limit.limit} onClick={()=>void decide(true)}>Setujui & Catat Kasbon</button></div>
 </div></Modal>
}

export function CashAdvanceAdditionRequests({employeeId,isOwner,onChanged}:{employeeId:string|null;isOwner:boolean;onChanged:()=>Promise<void>}){
 const [rows,setRows]=useState<Request[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const [all,setAll]=useState(false),[open,setOpen]=useState(false),[review,setReview]=useState<Request|null>(null),sequence=useRef(0)
 const load=useCallback(async()=>{
  const seq=++sequence.current;setLoading(true);setError('')
  try{
   const records:Request[]=[]
   for(let offset=0;;offset+=100){const r=await supabase.from('v113163_cash_advance_addition_requests').select('*').order('requested_at',{ascending:false}).order('id',{ascending:true}).range(offset,offset+99);if(r.error)throw r.error;const page=(r.data||[]) as Request[];records.push(...page);if(page.length<100)break}
   if(seq===sequence.current)setRows(records)
  }catch(e){if(seq===sequence.current){setRows([]);setError(`Pengajuan tambahan belum dapat dimuat. Pastikan SQL 085 sudah dijalankan. ${message(e)}`)}}finally{if(seq===sequence.current)setLoading(false)}
 },[])
 useEffect(()=>{void load();return()=>{++sequence.current}},[load])
 const shown=rows.filter(r=>(!employeeId||r.employee_id===employeeId)&&(all||r.status==='pending'))
 return <section className="panel" id="additional-cash-advance-requests" style={{padding:16,marginTop:16}}>
  <h3>Pengajuan Tambahan Kasbon</h3><p>Termasuk kasbon yang melebihi gaji tersedia. Menunggu persetujuan Owner sebelum dicatat sebagai kasbon dan kas keluar.</p>
  <div className="cash-correction-request-tools"><button className="secondary-button" disabled={loading||!!error} onClick={()=>setOpen(true)}>Ajukan Tambahan Kasbon</button><button className="secondary-button" disabled={loading} onClick={()=>void load()}>Muat Ulang Tambahan</button><label><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/> Tampilkan riwayat keputusan tambahan</label></div>
  {loading&&<p role="status">Memuat pengajuan tambahan...</p>}{error&&<div role="alert" className="error-box">{error}</div>}{success&&<div role="status" className="success-box">{success}</div>}
  <div className="table-wrap"><table><thead><tr><th>Tanggal / Pengaju</th><th>Karyawan</th><th>Tambahan / Metode</th><th>Alasan</th><th>Status / Keputusan</th>{isOwner&&<th>Aksi</th>}</tr></thead><tbody>
   {shown.map(r=><tr key={r.id}><td>{businessDateTimeLabel(r.requested_at)}<small style={{display:'block'}}>{r.requester_name}</small></td><td>{r.employee_name}</td><td>{formatRupiah(Number(r.amount))}<small style={{display:'block'}}>{methods[r.payment_method]||r.payment_method}</small></td><td className="cash-correction-request-reason">{r.reason}</td><td>{labels[r.status]}{r.reviewed_at&&<small style={{display:'block'}}>{r.reviewer_name} • {businessDateTimeLabel(r.reviewed_at)} • {r.review_note}</small>}</td>{isOwner&&<td>{r.status==='pending'&&<button className="secondary-button" disabled={loading} onClick={()=>setReview(r)}>Tinjau Tambahan Kasbon</button>}</td>}</tr>)}
   {!loading&&!shown.length&&<tr><td colSpan={isOwner?6:5}>Tidak ada pengajuan tambahan pada pilihan ini.</td></tr>}
  </tbody></table></div>
  {open&&<CashAdvanceAdditionRequestModal initial={{...empty,employee_id:employeeId||''}} onClose={()=>setOpen(false)} onSent={async()=>{setSuccess('Pengajuan terkirim ke Owner. Saldo kasbon dan Kas Harian belum berubah.');await load()}}/>}
  {review&&isOwner&&<AdditionReview request={review} onClose={()=>setReview(null)} onDecided={async approved=>{setSuccess(approved?'Disetujui. Kasbon baru dan Kas Keluar sudah tercatat.':'Pengajuan ditolak. Saldo kasbon dan Kas Harian tidak berubah.');await load();await onChanged()}}/>}
 </section>
}
