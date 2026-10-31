import {useEffect,useRef,useState,type FormEvent} from 'react'
import {supabase} from '../lib/supabase'
import {loadCashAdvanceRepayments,type CashAdvanceRepayment} from '../lib/cashAdvanceRepayments'
import {formatRupiah} from '../lib/format'
import {BUSINESS_TIME_ZONE} from '../lib/businessTime'
import {downloadXls,printPdf} from '../lib/exportData'
export function CashAdvanceRepayments({employee,remaining,onSaved}:{employee:{id:string;full_name:string};remaining:number;onSaved:()=>Promise<void>}){
 const [rows,setRows]=useState<CashAdvanceRepayment[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [open,setOpen]=useState(false),[amount,setAmount]=useState(''),[method,setMethod]=useState<'cash'|'transfer'>('cash'),[reference,setReference]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false)
 const [cancelId,setCancelId]=useState(''),[cancelReason,setCancelReason]=useState('')
 const pending=useRef(false),request=useRef<{key:string;payload:string}|null>(null)
 useEffect(()=>{let alive=true;setLoading(true);setError('');void loadCashAdvanceRepayments(employee.id).then(r=>{if(alive)setRows(r)}).catch(e=>{if(alive)setError(String(e.message||e))}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[employee.id,revision])
 const value=Number(amount),valid=amount.trim()!==''&&Number.isFinite(value)&&value>0&&value<=remaining&&(method!=='transfer'||reference.trim().length>=3)
 const save=async(e:FormEvent)=>{
  e.preventDefault();if(pending.current)return
  if(!valid){setError('Periksa nominal, sisa utang, dan referensi transfer.');return}
  const args={p_employee_id:employee.id,p_amount:value,p_method:method,p_reference:reference.trim()||null,p_note:note.trim()||null}
  const payload=JSON.stringify(args)
  if(request.current?.payload!==payload)request.current={key:globalThis.crypto.randomUUID(),payload}
  pending.current=true;setBusy(true);setError('')
  try{
   const r=await supabase.rpc('v113153_receive_cash_advance_repayment',{...args,p_request_id:request.current!.key})
   if(r.error)throw r.error
   await onSaved()
  }catch(e){setError(String((e as {message?:string})?.message||e))}
  finally{pending.current=false;setBusy(false)}
 }
 const cancel=async(e:FormEvent)=>{
  e.preventDefault();if(pending.current||cancelReason.trim().length<5)return
  pending.current=true;setBusy(true);setError('')
  try{const r=await supabase.rpc('v113153_cancel_cash_advance_repayment',{p_id:cancelId,p_reason:cancelReason.trim()});if(r.error)throw r.error;await onSaved()}
  catch(e){setError(String((e as {message?:string})?.message||e))}
  finally{pending.current=false;setBusy(false)}
 }
 const time=(v:string)=>new Date(v).toLocaleString('id-ID',{timeZone:BUSINESS_TIME_ZONE})
 const options=()=>({title:`Pembayaran Kasbon Tunai / Transfer — ${employee.full_name}`,filename:`bayar-kasbon-${employee.id}`,subtitle:'Seluruh tanggal • Waktu WIB • Pembayaran utang, bukan omzet atau potongan gaji.',headers:['Tanggal Bayar','Metode','Nominal','Referensi','Keterangan','Status','Tanggal Pembatalan','Alasan Pembatalan'],rows:rows.map(r=>[time(r.created_at),r.method==='cash'?'Tunai':'Transfer',Number(r.amount),r.reference||'-',r.note||'-',r.cancelled_at?'Dibatalkan':'Tercatat',r.cancelled_at?time(r.cancelled_at):'-',r.cancel_reason||'-']),summary:[['Total Pembayaran Aktif',rows.filter(r=>!r.cancelled_at).reduce((s,r)=>s+Number(r.amount),0)]] as Array<[string,string|number]>})
 return <section className="deduction-history-section cash-advance-repayments">
  <div className="section-title"><b>Pembayaran Kasbon Tunai / Transfer</b></div>
  <p>Pembayaran ini mengurangi utang kasbon tanpa mengurangi gaji. Tercatat sebagai kas masuk di Kas Harian, bukan omzet laundry. Catat setelah uang diterima; aplikasi tidak menjalankan transfer bank.</p>
  <div className="deduction-history-toolbar">
   <button className="primary-button" disabled={busy||loading||!!error||remaining<=0} onClick={()=>{setOpen(true);setCancelId('')}}>Bayar Tunai / Transfer</button>
   <button className="secondary-button" disabled={busy||loading} onClick={()=>setRevision(v=>v+1)}>Muat Ulang Pembayaran</button>
   <button className="secondary-button" disabled={loading||!!error} onClick={()=>downloadXls(options())}>XLS Pembayaran</button>
   <button className="secondary-button" disabled={loading||!!error} onClick={()=>printPdf(options())}>Print / PDF Pembayaran</button>
  </div>
  {error&&<div className="error-box" role="alert">{error}</div>}
  {open&&<form className="modal-form" onSubmit={save}>
   <label>Metode Pembayaran Kasbon<select aria-label="Metode Pembayaran Kasbon" value={method} disabled={busy} onChange={e=>setMethod(e.target.value as 'cash'|'transfer')}><option value="cash">Tunai</option><option value="transfer">Transfer</option></select></label>
   <label>Nominal Pembayaran Kasbon<input aria-label="Nominal Pembayaran Kasbon" type="number" min="1" max={remaining} step="0.01" value={amount} disabled={busy} required onChange={e=>setAmount(e.target.value)}/></label>
   <label>Referensi / Bukti Transfer<input aria-label="Referensi Pembayaran Kasbon" value={reference} disabled={busy} required={method==='transfer'} minLength={method==='transfer'?3:undefined} onChange={e=>setReference(e.target.value)} placeholder="Nomor referensi transfer atau keterangan penerimaan"/></label>
   <label>Keterangan Pembayaran<input aria-label="Keterangan Pembayaran Kasbon" value={note} disabled={busy} onChange={e=>setNote(e.target.value)}/></label>
   {valid&&<div className="info-box">Sisa utang setelah pembayaran: <b>{formatRupiah(remaining-value)}</b>. Potongan gaji dan sisa gaji tetap.</div>}
   <div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>setOpen(false)}>Tutup Form Pembayaran</button><button className="primary-button" disabled={busy||!valid}>{busy?'Menyimpan...':'Simpan Pembayaran Kasbon'}</button></div>
  </form>}
  {loading?<p>Memuat pembayaran...</p>:<div className="table-wrap deduction-correction-history"><table>
   <thead><tr><th>Tanggal Bayar (WIB)</th><th>Metode</th><th>Nominal</th><th>Referensi</th><th>Status</th><th>Keterangan</th><th>Aksi</th></tr></thead>
   <tbody>{rows.map(r=><tr key={r.id}><td>{time(r.created_at)}</td><td>{r.method==='cash'?'Tunai':'Transfer'}</td><td>{formatRupiah(Number(r.amount))}</td><td>{r.reference||'-'}</td><td>{r.cancelled_at?'Dibatalkan':'Tercatat'}</td><td>{r.cancel_reason||r.note||'-'}</td><td>{!r.cancelled_at&&<button className="secondary-button" disabled={busy} onClick={()=>{setCancelId(r.id);setCancelReason('');setOpen(false)}}>Batalkan Pembayaran</button>}</td></tr>)}
    {!rows.length&&!error&&<tr><td colSpan={7}>Belum ada pembayaran tunai / transfer.</td></tr>}
   </tbody></table></div>}
  {cancelId&&<form className="modal-form" onSubmit={cancel}>
   <div className="info-box">Pembatalan mengembalikan saldo utang dan mencatat transaksi pembalik pada Kas Harian. Riwayat pembayaran tetap ada. Tidak menjalankan pengembalian uang melalui bank secara otomatis.</div>
   <label>Alasan Pembatalan Pembayaran<input aria-label="Alasan Pembatalan Pembayaran" required minLength={5} value={cancelReason} disabled={busy} onChange={e=>setCancelReason(e.target.value)}/></label>
   <div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>setCancelId('')}>Tutup Pembatalan</button><button className="danger-button" disabled={busy||cancelReason.trim().length<5}>Simpan Pembatalan Pembayaran</button></div>
  </form>}
 </section>
}
