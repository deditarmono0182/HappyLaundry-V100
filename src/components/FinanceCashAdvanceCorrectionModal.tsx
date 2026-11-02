import {useCallback,useEffect,useRef,useState} from 'react'
import {CashAdvanceCorrectionRequests} from './CashAdvanceCorrectionRequests'
import {Modal} from './Modal'
import {supabase} from '../lib/supabase'

type Source={
 employees:{id:string;name:string}[]
 advances:{id:string;employee_id:string;amount:number;remaining_amount:number;note:string|null;issued_at:string;cancelled_at:string|null}[]
}

// Use the same authorized report and correction form as the full report page.
// Loading and submitting a proposal never changes the loan balance or cash ledger.
export function FinanceCashAdvanceCorrectionModal({onClose,onSubmitted}:{onClose:()=>void;onSubmitted:()=>void}){
 const [data,setData]=useState<Source|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),sequence=useRef(0)
 const load=useCallback(async()=>{
  const seq=++sequence.current;setLoading(true);setError('')
  try{
   const r=await supabase.rpc('v113134_owner_cash_advance_report')
   if(r.error)throw new Error(r.error.message)
   if(!r.data||!Array.isArray(r.data.employees)||!Array.isArray(r.data.advances))throw new Error('Format daftar kasbon tidak valid')
   if(seq===sequence.current)setData(r.data as Source)
  }catch(e){if(seq===sequence.current){setData(null);setError(e instanceof Error?e.message:String(e))}}
  finally{if(seq===sequence.current)setLoading(false)}
 },[])
 useEffect(()=>{void load();return()=>{++sequence.current}},[load])
 if(!loading&&data)return <CashAdvanceCorrectionRequests loans={data.advances} employees={data.employees} employeeId={null} isOwner={false} onChanged={async()=>{}} composerOnClose={onClose} onSubmitted={onSubmitted}/>
 return <Modal title="Ajukan Koreksi Kasbon" onClose={onClose}><div className="modal-form">
  {loading?<p role="status">Memuat catatan kasbon...</p>:<><div className="error-box" role="alert">Daftar kasbon belum dapat dimuat. {error}. Pastikan SQL 073 sudah dijalankan.</div><button className="secondary-button" onClick={()=>void load()}>Coba Lagi</button></>}
 </div></Modal>
}
