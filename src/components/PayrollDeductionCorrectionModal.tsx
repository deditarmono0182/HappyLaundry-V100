import {useRef,useState,type FormEvent} from 'react'
import {Modal} from './Modal'
import {supabase} from '../lib/supabase'
import {formatRupiah} from '../lib/format'
import {PayrollDeductionHistory} from './PayrollDeductionHistory'
export type DeductionCorrectionTarget={employee:{id:string;full_name:string};month:string;deduction:number;remaining:number;gross:number;paid:number;historyOnly?:boolean}
export function PayrollDeductionCorrectionModal({target,onClose,onSaved}:{target:DeductionCorrectionTarget;onClose:()=>void;onSaved:()=>Promise<void>}){
 const [amount,setAmount]=useState(String(target.deduction)),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [historyReady,setHistoryReady]=useState(false),[historyOnly,setHistoryOnly]=useState(!!target.historyOnly)
 const pending=useRef(false)
 const value=Number(amount),max=Math.max(0,Math.min(target.gross,target.deduction+target.remaining))
 const valid=amount.trim()!==''&&Number.isFinite(value)&&value>=0&&value<=max&&Math.abs(value*100-Math.round(value*100))<0.000001
 const newRemaining=target.remaining+target.deduction-(valid?value:0)
 const newSalary=Math.max(0,target.gross-(valid?value:0))
 const save=async(e:FormEvent)=>{
  e.preventDefault()
  if(pending.current)return
  if(target.paid>0){setError('Gaji bulan ini sudah dibayar. Koreksi potongan tidak dapat disimpan.');return}
  if(!valid){setError(`Isi potongan total baru antara Rp0 dan ${formatRupiah(max)}.`);return}
  if(value===target.deduction){setError('Nominal potongan belum berubah.');return}
  if(reason.trim().length<5){setError('Alasan koreksi minimal 5 karakter.');return}
  pending.current=true;setBusy(true);setError('')
  try{
   const r=await supabase.rpc('v113152_correct_payroll_deduction',{p_employee_id:target.employee.id,p_payroll_month:`${target.month}-01`,p_expected_amount:target.deduction,p_new_amount:value,p_reason:reason.trim()})
   if(r.error)throw r.error
   await onSaved()
  }catch(e){setError(String((e as {message?:string})?.message||e))}
  finally{pending.current=false;setBusy(false)}
 }
 return <Modal title={`${historyOnly?'Riwayat':'Koreksi'} Potongan Kasbon — ${target.employee.full_name}`} onClose={()=>!pending.current&&onClose()} className="payroll-deduction-correction-modal">
  {!historyOnly&&<form className="modal-form" onSubmit={save}>
   <div className="info-box">Bulan gaji <b>{target.month}</b>. Isi <b>total potongan yang benar untuk bulan ini</b>. Contoh: agar total potongan menjadi Rp300.000, isi 300000. Jumlah pinjaman tetap; sisa utang dan sisa gaji akan menyesuaikan. Tidak membuat transaksi kas baru.</div>
   <div className="payroll-payment-card">
    <div><span>Potongan Tercatat</span><b>{formatRupiah(target.deduction)}</b></div>
    <div><span>Sisa Utang Tercatat</span><b>{formatRupiah(target.remaining)}</b></div>
    <div><span>Gaji Kotor</span><b>{formatRupiah(target.gross)}</b></div>
    <div><span>Sudah Dibayar</span><b>{formatRupiah(target.paid)}</b></div>
   </div>
   {target.paid>0&&<div className="error-box">Gaji bulan ini sudah memiliki pembayaran. Riwayat dapat dilihat; koreksi dinonaktifkan.</div>}
   <label>Total Potongan Baru<input aria-label="Total Potongan Baru" type="number" min="0" max={max} step="0.01" value={amount} disabled={busy||target.paid>0} required onChange={e=>setAmount(e.target.value)}/></label>
   <small>Maksimal {formatRupiah(max)}. Nilai 0 membatalkan seluruh potongan bulan ini. Simpan perubahan Bonus terlebih dahulu agar gaji memakai data tersimpan.</small>
   {valid&&<div className="payroll-payment-card" aria-label="Pratinjau koreksi">
    <div><span>Pratinjau Sisa Utang</span><b>{formatRupiah(newRemaining)}</b></div>
    <div><span>Pratinjau Sisa Gaji</span><b>{formatRupiah(Math.max(0,newSalary-target.paid))}</b></div>
   </div>}
   <label>Alasan Koreksi<input aria-label="Alasan Koreksi Potongan" value={reason} minLength={5} required disabled={busy||target.paid>0} onChange={e=>setReason(e.target.value)} placeholder="Contoh: salah input, potongan sesuai kesepakatan Rp300.000"/></label>
   {error&&<div className="error-box" role="alert">{error}</div>}
   <div className="form-actions">
    <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Tutup</button>
    <button className="primary-button" disabled={busy||!historyReady||target.paid>0||!valid||value===target.deduction||reason.trim().length<5}>{busy?'Menyimpan...':'Simpan Koreksi Potongan'}</button>
   </div>
  </form>}
  <PayrollDeductionHistory employee={target.employee} month={target.month} allInitially={!!target.historyOnly} onReady={setHistoryReady}/>
  {historyOnly&&<div className="form-actions">
   <button className="secondary-button" onClick={onClose}>Tutup</button>
   <button className="primary-button" disabled={target.paid>0} onClick={()=>setHistoryOnly(false)}>Koreksi Potongan Bulan {target.month}</button>
  </div>}
 </Modal>
}
