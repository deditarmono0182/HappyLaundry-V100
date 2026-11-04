import {useCallback,useEffect,useRef,useState} from 'react'
import {CashAdvanceAdditionRequests} from './CashAdvanceAdditionRequests'
import {CashAdvanceCorrectionRequests} from './CashAdvanceCorrectionRequests'
import {supabase} from '../lib/supabase'

type Source={employees:{id:string;name:string}[];advances:{id:string;employee_id:string;amount:number;remaining_amount:number;note:string|null;issued_at:string;cancelled_at:string|null}[]}
export type CashAdvanceRequestTab='addition'|'correction'

// Both account types use the same request records as the full report.
// Only the existing Owner review controls can approve or reject a request.
export function FinanceCashAdvanceRequestCenter({tab,isOwner,onChanged,onClose,showHistory=false,focusRequestId}:{showHistory?:boolean;focusRequestId?:string;tab:CashAdvanceRequestTab;isOwner:boolean;onChanged:()=>Promise<void>;onClose:()=>void}){
 const [data,setData]=useState<Source|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),sequence=useRef(0)
 const load=useCallback(async(silent=false)=>{
  const seq=++sequence.current;if(!silent)setLoading(true);setError('')
  try{
   const r=await supabase.rpc('v113134_owner_cash_advance_report')
   if(r.error)throw new Error(r.error.message)
   if(!r.data||!Array.isArray(r.data.employees)||!Array.isArray(r.data.advances))throw new Error('Format daftar kasbon tidak valid')
   if(seq===sequence.current)setData(r.data as Source)
  }catch(e){if(seq===sequence.current){setData(null);setError(e instanceof Error?e.message:String(e))}}
  finally{if(seq===sequence.current&&!silent)setLoading(false)}
 },[])
 useEffect(()=>{if(tab==='correction')void load();return()=>{++sequence.current}},[tab,load])
 return <div id="finance-cash-advance-requests" style={{marginBottom:16}}>
  <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Tutup Pengajuan</button></div>
  {tab==='addition'?<CashAdvanceAdditionRequests employeeId={null} isOwner={isOwner} initialShowAll={showHistory} focusRequestId={focusRequestId} onChanged={onChanged}/>:<>
   {loading&&<p role="status">Memuat catatan kasbon...</p>}
   {error&&<div role="alert" className="error-box">Daftar kasbon belum dapat dimuat. {error}. <button type="button" className="secondary-button" onClick={()=>void load()}>Coba Lagi</button></div>}
   {!loading&&data&&<CashAdvanceCorrectionRequests loans={data.advances} employees={data.employees} employeeId={null} isOwner={isOwner} initialShowAll={showHistory} focusRequestId={focusRequestId} onChanged={async()=>{await onChanged();await load(true)}}/>}
  </>}
 </div>
}
