import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react'
import {Modal} from './Modal'
import {supabase} from '../lib/supabase'
import {formatRupiah} from '../lib/format'
import {businessDateTimeLabel} from '../lib/businessTime'

type Payment={id:string;amount:number;paid_at:string;payment_method:string;note:string|null}
type Cancellation={id:string;total_amount:number;reason:string;cancelled_at:string;payments:Payment[]}
export function PayrollPaymentCancellation({employee,month,payments,isOwner,onChanged}:{employee:{id:string;full_name:string};month:string;payments:Payment[];isOwner:boolean;onChanged:()=>Promise<void>}){
 const [history,setHistory]=useState<Cancellation[]>([]),[error,setError]=useState(''),[success,setSuccess]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false)
 const [target,setTarget]=useState<{employee:{id:string;full_name:string};month:string;payments:Payment[]}|null>(null),[reason,setReason]=useState('')
 const alive=useRef(true),sequence=useRef(0)
 const pending=useRef(false),retry=useRef<{key:string;id:string}|null>(null)
 const load=useCallback(async()=>{
  if(!alive.current)return
  const seq=++sequence.current
  setLoading(true);setError('')
  try{
   const rows:Cancellation[]=[]
   for(let offset=0;;offset+=100){
    const r=await supabase.from('v113162_payroll_payment_cancellations').select('*').eq('employee_id',employee.id).eq('payroll_month',month+'-01').order('cancelled_at',{ascending:false}).order('id',{ascending:true}).range(offset,offset+99)
    if(r.error)throw new Error('Riwayat pembatalan belum tersedia. Jalankan SQL 084. '+r.error.message)
    const page=(r.data||[]) as Cancellation[];rows.push(...page);if(page.length<100)break
   }
   if(alive.current&&seq===sequence.current)setHistory(rows)
  }catch(e){if(alive.current&&seq===sequence.current){setError(e instanceof Error?e.message:String(e));setHistory([])}}
  finally{if(alive.current&&seq===sequence.current)setLoading(false)}
 },[employee.id,month])
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;++sequence.current}},[load])
 const cancel=async(event:FormEvent)=>{
  event.preventDefault();if(!target||!isOwner||pending.current)return
  if(reason.trim().length<5){setError('Alasan minimal 5 karakter.');return}
  const args={p_employee_id:target.employee.id,p_payroll_month:target.month+'-01',p_expected_total:Math.round(target.payments.reduce((sum,p)=>sum+Number(p.amount),0)*100)/100,p_expected_ids:target.payments.map(p=>p.id).sort(),p_reason:reason.trim()}
  const key=JSON.stringify(args);if(retry.current?.key!==key)retry.current={key,id:crypto.randomUUID()}
  pending.current=true;setBusy(true);setError('');setSuccess('')
  try{
   const r=await supabase.rpc('v113162_cancel_payroll_payments',{...args,p_request_id:retry.current.id})
   if(r.error)throw new Error(r.error.message)
   setTarget(null);setSuccess('Pembayaran periode ini dibatalkan. Catatan asli tersimpan pada riwayat pembatalan.');await onChanged();await load()
  }catch(e){setError(e instanceof Error?e.message:'Pembatalan belum dapat dikonfirmasi. Muat ulang riwayat sebelum mencoba lagi.')}
  finally{pending.current=false;setBusy(false)}
 }
 return <section className="payroll-cancellation-history" style={{marginTop:14}}>
  {isOwner&&payments.length>0&&<button className="secondary-button" disabled={busy||loading||!!error} onClick={()=>{setTarget({employee:{...employee},month,payments:payments.map(p=>({...p}))});setReason('');setError('');setSuccess('');retry.current=null}}>Batalkan Pembayaran Gaji Periode Ini</button>}
  {loading&&<p role="status">Memuat riwayat pembatalan...</p>}{error&&<div className="error-box">{error}</div>}{success&&<div className="success-box">{success}</div>}
  {history.length>0&&<><h4>Riwayat Pembatalan Pembayaran Gaji</h4>{history.map(h=><details key={h.id}><summary>{businessDateTimeLabel(h.cancelled_at)} • Dibatalkan {formatRupiah(Number(h.total_amount))} • {h.reason}</summary><div className="table-wrap"><table><thead><tr><th>Tanggal Bayar Asli</th><th>Metode</th><th>Nominal Asli</th><th>Catatan</th></tr></thead><tbody>{h.payments.map(p=><tr key={p.id}><td>{businessDateTimeLabel(p.paid_at)}</td><td>{p.payment_method}</td><td>{formatRupiah(Number(p.amount))}</td><td>{p.note||'—'}</td></tr>)}</tbody></table></div></details>)}</>}
  {target&&<Modal title={`Batalkan Pembayaran — ${target.employee.full_name}`} onClose={()=>!busy&&setTarget(null)}><form className="modal-form" onSubmit={cancel}>
   <p>Periode {target.month}. Seluruh {target.payments.length} catatan pembayaran aktif berikut akan dipindahkan ke riwayat pembatalan:</p>
   <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Metode</th><th>Nominal</th></tr></thead><tbody>{target.payments.map(p=><tr key={p.id}><td>{businessDateTimeLabel(p.paid_at)}</td><td>{p.payment_method}</td><td>{formatRupiah(Number(p.amount))}</td></tr>)}</tbody></table></div>
   <p>Total dibatalkan: {formatRupiah(target.payments.reduce((sum,p)=>sum+Number(p.amount),0))}</p>
   <div className="warning-box">Sudah Dibayar periode ini menjadi Rp0 dan sisa gaji dihitung ulang. Kasbon, potongan gaji, komisi dan kehadiran tidak berubah. Ini hanya pembatalan catatan; uang yang sudah ditransfer/tunai tidak otomatis dikembalikan.</div>
   <label>Alasan Pembatalan<textarea minLength={5} required value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label>
   {error&&<div className="error-box">{error}</div>}<div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>setTarget(null)}>Kembali</button><button className="danger-button" disabled={busy}>{busy?'Memproses...':'Konfirmasi Pembatalan Pembayaran'}</button></div>
  </form></Modal>}
 </section>
}
