import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react'
import {Modal} from './Modal'
import {supabase} from '../lib/supabase'
import {formatRupiah} from '../lib/format'
import {businessDateTimeLabel} from '../lib/businessTime'

type Loan={id:string;employee_id:string;amount:number;remaining_amount:number;note:string|null;issued_at:string;cancelled_at:string|null}
type Employee={id:string;name:string}
type Request={id:string;cash_advance_id:string;employee_id:string;employee_name:string;old_amount:number;old_remaining:number;old_note:string|null;new_amount:number;new_note:string|null;reason:string;status:'pending'|'approved'|'rejected'|'stale';requester_name:string;requested_at:string;reviewer_name:string|null;reviewed_at:string|null;review_note:string|null}
const labels={pending:'Menunggu Owner',approved:'Disetujui',rejected:'Ditolak',stale:'Perlu diajukan ulang'}
export function CashAdvanceCorrectionRequests({loans,employees,employeeId,isOwner,onChanged}:{loans:Loan[];employees:Employee[];employeeId:string|null;isOwner:boolean;onChanged:()=>Promise<void>}){
 const [requests,setRequests]=useState<Request[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const [selected,setSelected]=useState(''),[all,setAll]=useState(false),[target,setTarget]=useState<Loan|null>(null),[review,setReview]=useState<Request|null>(null)
 const [form,setForm]=useState({amount:'',note:'',reason:''}),[decision,setDecision]=useState(''),[busy,setBusy]=useState(false)
 const pending=useRef(false),retry=useRef<{key:string;id:string}|null>(null),sequence=useRef(0)
 const load=useCallback(async()=>{
  const seq=++sequence.current;setLoading(true);setError('')
  try{
   const rows:Request[]=[]
   for(let offset=0;;offset+=100){
    const r=await supabase.from('v113161_cash_advance_requests').select('*').order('requested_at',{ascending:false}).order('id',{ascending:true}).range(offset,offset+99)
    if(r.error)throw new Error(r.error.message)
    const page=(r.data||[]) as Request[];rows.push(...page);if(page.length<100)break
   }
   if(seq===sequence.current)setRequests(rows)
  }catch(e){if(seq===sequence.current){setRequests([]);setError(`Pengajuan belum dapat dimuat. Pastikan SQL 083 Pengajuan Koreksi Kasbon sudah dijalankan. ${e instanceof Error?e.message:String(e)}`)}}
  finally{if(seq===sequence.current)setLoading(false)}
 },[])
 useEffect(()=>{void load();return()=>{++sequence.current}},[load])
 const choices=useMemo(()=>loans.filter(l=>!l.cancelled_at&&(!employeeId||l.employee_id===employeeId)),[loans,employeeId])
 const loan=choices.find(l=>l.id===selected)
 const shown=requests.filter(r=>(!employeeId||r.employee_id===employeeId)&&(all||r.status==='pending'))
 const open=()=>{if(!loan)return;retry.current=null;setTarget({...loan});setForm({amount:String(loan.amount),note:loan.note||'',reason:''});setError('');setSuccess('')}
 const send=async(event:FormEvent)=>{
  event.preventDefault();if(!target||pending.current)return
  const amount=Number(form.amount),reason=form.reason.trim()
  if(!Number.isFinite(amount)||amount<=0||Math.abs(Math.round(amount*100)-amount*100)>0.000001){setError('Isi nominal baru yang valid, maksimal 2 angka desimal.');return}
  if(amount<Number(target.amount)-Number(target.remaining_amount)){setError('Nominal lebih kecil dari yang sudah dipotong/dibayar.');return}
  if(reason.length<5){setError('Alasan minimal 5 karakter.');return}
  const args={p_cash_advance_id:target.id,p_expected_amount:Number(target.amount),p_expected_remaining:Number(target.remaining_amount),p_expected_note:target.note,p_new_amount:amount,p_new_note:form.note.trim()||null,p_reason:reason}
  const key=JSON.stringify(args);if(retry.current?.key!==key)retry.current={key,id:crypto.randomUUID()}
  pending.current=true;setBusy(true);setError('');setSuccess('')
  try{
   const r=await supabase.rpc('v113161_request_cash_advance_correction',{...args,p_request_id:retry.current.id})
   if(r.error)throw new Error(r.error.message)
   setTarget(null);setSuccess('Pengajuan tersimpan. Saldo kasbon belum berubah; menunggu keputusan Owner.');await load()
  }catch(e){setError(e instanceof Error?e.message:'Pengajuan belum dapat dikonfirmasi. Muat ulang riwayat sebelum mencoba lagi.')}
  finally{pending.current=false;setBusy(false)}
 }
 const decide=async(approve:boolean)=>{
  if(!review||!isOwner||pending.current)return
  if(decision.trim().length<5){setError('Catatan keputusan minimal 5 karakter.');return}
  pending.current=true;setBusy(true);setError('');setSuccess('')
  try{
   const r=await supabase.rpc('v113161_review_cash_advance_correction',{p_request_id:review.id,p_approve:approve,p_review_note:decision.trim()})
   if(r.error)throw new Error(r.error.message)
   const result=r.data as Request
   setReview(null);setSuccess(result.status==='stale'?'Data kasbon sudah berubah. Pengajuan ditandai perlu diajukan ulang.':result.status==='approved'?'Koreksi disetujui. Saldo kasbon dan riwayat sudah diperbarui.':'Pengajuan ditolak. Saldo kasbon tidak berubah.')
   await load();await onChanged()
  }catch(e){setError(e instanceof Error?e.message:'Keputusan belum dapat dikonfirmasi. Muat ulang riwayat sebelum mencoba lagi.')}
  finally{pending.current=false;setBusy(false)}
 }
 return <section className="panel" id="correction-requests" style={{padding:16,marginTop:16}}>
  <h3>Pengajuan Koreksi Kasbon</h3>
  <p>Koreksi nominal pinjaman harus disetujui Owner. Pengajuan tidak memotong gaji atau mengubah saldo.</p>
  <div className="cash-correction-request-tools">
   <select aria-label="Pilih kasbon yang dikoreksi" value={loan?selected:''} onChange={e=>setSelected(e.target.value)} disabled={loading||!!error||busy}>
    <option value="">Pilih catatan kasbon...</option>
    {choices.map(l=><option key={l.id} value={l.id}>{employees.find(e=>e.id===l.employee_id)?.name||'Karyawan'} • {businessDateTimeLabel(l.issued_at)} • {formatRupiah(Number(l.amount))}</option>)}
   </select>
   <button className="secondary-button" disabled={!loan||loading||!!error||busy||requests.some(r=>r.cash_advance_id===loan.id&&r.status==='pending')} onClick={open}>Ajukan Koreksi Kasbon</button>
   <button className="secondary-button" disabled={busy||loading} onClick={()=>void load()}>Muat Ulang Pengajuan</button>
   <label><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/> Tampilkan riwayat keputusan</label>
  </div>
  {loading&&<p role="status">Memuat pengajuan...</p>}{error&&<div className="error-box" role="alert">{error}</div>}{success&&<div className="success-box" role="status">{success}</div>}
  <div className="table-wrap"><table><thead><tr><th>Tanggal / Pengaju</th><th>Karyawan</th><th>Nominal Lama → Baru</th><th>Alasan</th><th>Status / Keputusan</th>{isOwner&&<th>Aksi</th>}</tr></thead><tbody>
   {shown.map(r=><tr key={r.id}><td>{businessDateTimeLabel(r.requested_at)}<small style={{display:'block'}}>{r.requester_name}</small></td><td>{r.employee_name}</td><td>{formatRupiah(Number(r.old_amount))} → {formatRupiah(Number(r.new_amount))}</td><td className="cash-correction-request-reason">{r.reason}</td><td>{labels[r.status]}{r.reviewed_at&&<small style={{display:'block'}}>{r.reviewer_name} • {businessDateTimeLabel(r.reviewed_at)} • {r.review_note}</small>}</td>{isOwner&&<td>{r.status==='pending'&&<button className="secondary-button" disabled={busy||loading} onClick={()=>{setReview(r);setDecision('');setError('')}}>Tinjau Pengajuan</button>}</td>}</tr>)}
   {!loading&&!shown.length&&<tr><td colSpan={isOwner?6:5}>Tidak ada pengajuan pada pilihan ini.</td></tr>}
  </tbody></table></div>
  {target&&<Modal title="Ajukan Koreksi Pinjaman Kasbon" onClose={()=>!busy&&setTarget(null)}><form className="modal-form" onSubmit={send}>
   <p>{employees.find(e=>e.id===target.employee_id)?.name} • Pinjaman {formatRupiah(Number(target.amount))} • Sisa {formatRupiah(Number(target.remaining_amount))}</p>
   <label>Nominal Pinjaman yang Benar<input type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required disabled={busy}/></label>
   <label>Keterangan Pinjaman<textarea value={form.note} onChange={e=>setForm({...form,note:e.target.value})} disabled={busy}/></label>
   <label>Alasan Koreksi<textarea value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} minLength={5} required disabled={busy}/></label>
   <div className="info-box">Nominal lama → baru: {formatRupiah(Number(target.amount))} → {formatRupiah(Number(form.amount)||0)}. Saldo berubah setelah disetujui Owner. Ini bukan koreksi potongan gaji.</div>
   {error&&<div className="error-box">{error}</div>}<div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>setTarget(null)}>Batal</button><button className="primary-button" disabled={busy}>{busy?'Mengirim...':'Kirim ke Owner'}</button></div>
  </form></Modal>}
  {review&&<Modal title={`Tinjau Koreksi — ${review.employee_name}`} onClose={()=>!busy&&setReview(null)}><div className="modal-form">
   <div className="cash-correction-request-summary"><div><span>Pinjaman Lama</span>{formatRupiah(Number(review.old_amount))}</div><div><span>Pinjaman Baru</span>{formatRupiah(Number(review.new_amount))}</div><div><span>Sisa Setelah Koreksi</span>{formatRupiah(Number(review.old_remaining)+Number(review.new_amount)-Number(review.old_amount))}</div></div>
   <p className="cash-correction-request-reason">Pengaju: {review.requester_name}<br/>Alasan: {review.reason}<br/>Keterangan lama: {review.old_note||'—'}<br/>Keterangan baru: {review.new_note||'—'}</p>
   <div className="warning-box">Jika disetujui, Kas Harian juga disesuaikan sebesar selisih pinjaman {formatRupiah(Math.abs(Number(review.new_amount)-Number(review.old_amount)))} ({Number(review.new_amount)>Number(review.old_amount)?'kas keluar tambahan':Number(review.new_amount)<Number(review.old_amount)?'koreksi kas masuk':'tanpa perubahan kas'}), sesuai mekanisme koreksi Owner. Potongan dan pembayaran gaji tidak diubah.</div>
   <label>Catatan Keputusan Owner<textarea value={decision} onChange={e=>setDecision(e.target.value)} minLength={5} disabled={busy}/></label>
   {error&&<div className="error-box">{error}</div>}<div className="form-actions"><button className="secondary-button" disabled={busy} onClick={()=>setReview(null)}>Batal</button><button className="secondary-button" disabled={busy} onClick={()=>void decide(false)}>Tolak Pengajuan</button><button className="primary-button" disabled={busy} onClick={()=>void decide(true)}>Setujui Koreksi</button></div>
  </div></Modal>}
 </section>
}
