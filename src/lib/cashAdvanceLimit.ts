import {useCallback,useEffect,useState} from 'react'
import {supabase} from './supabase'
export type CashAdvanceApproval={id:string;cash_advance_id:string;reason:string;approved_by:string|null;approved_at:string;salary_available:number;outstanding_after:number;excess:number}
export type CashAdvanceLimit={employee_id:string;payroll_month:string;gross:number;deductions:number;salary_paid:number;salary_available:number;outstanding:number;excess:number;approvals?:CashAdvanceApproval[]}
export type CashAdvanceLimitState={limit:CashAdvanceLimit|null;loading:boolean;error:string}
export const cashAdvanceExcess=(limit:CashAdvanceLimit,amount:number)=>Math.max(0,Number(limit.outstanding)+Math.max(0,amount||0)-Number(limit.salary_available))
export const cashAdvanceBlocked=(state:CashAdvanceLimitState,amount:number,owner:boolean,reason:string)=>state.loading||!!state.error||!state.limit||(cashAdvanceExcess(state.limit,amount)>0&&(!owner||reason.trim().length<5))
export function useCashAdvanceLimit(employeeId:string,enabled:boolean){
 const [state,setState]=useState<CashAdvanceLimitState>({limit:null,loading:true,error:''})
 const [revision,setRevision]=useState(0)
 const refresh=useCallback(()=>setRevision(v=>v+1),[])
 useEffect(()=>{
  let active=true
  setState({limit:null,loading:true,error:''})
  if(!enabled||!employeeId)return ()=>{active=false}
  void(async()=>{
   try{
    const {data,error}=await supabase.rpc('v113137_cash_advance_limits',{p_employee_id:employeeId})
    if(error)throw error
    const limit=(data as CashAdvanceLimit[])?.find(row=>row.employee_id===employeeId)
    if(!limit||!Number.isFinite(Number(limit.salary_available))||!Number.isFinite(Number(limit.outstanding)))throw new Error('Data batas kasbon tidak valid.')
    if(active)setState({limit,loading:false,error:''})
   }catch(cause){if(active)setState({limit:null,loading:false,error:String((cause as {message?:string})?.message||cause)})}
  })()
  return()=>{active=false}
 },[employeeId,enabled,revision])
 // Never use the previous employee's balance during a selection change.
 const current=state.limit&&state.limit.employee_id!==employeeId?{limit:null,loading:true,error:''}:state
 return {...current,refresh}
}
