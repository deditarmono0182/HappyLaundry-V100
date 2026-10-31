import {supabase} from './supabase'
export type CashAdvanceRepayment={id:string;employee_id:string;amount:number;method:'cash'|'transfer';reference:string|null;note:string|null;created_at:string;cancelled_at:string|null;cancel_reason:string|null}
export async function loadCashAdvanceRepayments(employeeId?:string){
 const rows:CashAdvanceRepayment[]=[]
 for(let offset=0;;offset+=100){
  let q=supabase.from('v113153_cash_advance_repayments').select('id,employee_id,amount,method,reference,note,created_at,cancelled_at,cancel_reason')
  if(employeeId)q=q.eq('employee_id',employeeId)
  const r=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+99)
  if(r.error)throw new Error(`Pembayaran kasbon gagal dimuat: ${r.error.message}. Pastikan SQL 082 sudah dijalankan.`)
  const page=(r.data||[]) as CashAdvanceRepayment[];rows.push(...page);if(page.length<100)break
 }
 return rows
}
