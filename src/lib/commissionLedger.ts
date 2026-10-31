import {supabase} from './supabase'
import {addBusinessDays,businessDateTimeIso} from './businessTime'
export type CommissionLedgerEntry={order_id:string;order_no:string;employee_id:string;commission_type:'production'|'courier';base_amount:number;percent:number;amount:number;earned_at:string}
// Each request stays below the API row cap. The full sort key uniquely identifies
// an earned right even when many team members share the same timestamp.
export async function loadCommissionLedger(fromDate?:string,toDate?:string):Promise<{data:CommissionLedgerEntry[]|null;error:{message:string}|null}>{
 try{
  const rows:CommissionLedgerEntry[]=[],seen=new Set<string>()
  for(let offset=0;;offset+=100){
   let q=supabase.from('v113_commission_ledger').select('*')
   if(fromDate)q=q.gte('earned_at',businessDateTimeIso(fromDate))
   if(toDate)q=q.lt('earned_at',businessDateTimeIso(addBusinessDays(toDate,1)))
   const result=await q.order('earned_at',{ascending:false}).order('order_id',{ascending:true}).order('employee_id',{ascending:true}).order('commission_type',{ascending:true}).range(offset,offset+99)
   if(result.error)throw result.error
   const page=(result.data||[]) as CommissionLedgerEntry[]
   for(const row of page){
    if(row.order_id&&row.employee_id&&row.commission_type){
     const key=`${row.order_id}|${row.employee_id}|${row.commission_type}`
     if(seen.has(key))throw new Error('Data komisi berubah saat dimuat atau memiliki duplikasi. Muat ulang sebelum membayar gaji.')
     seen.add(key)
    }
    rows.push(row)
   }
   if(page.length<100)return {data:rows,error:null}
  }
 }catch(e){return {data:null,error:{message:`Komisi belum dimuat lengkap: ${String((e as {message?:string})?.message||e)}`}}}
}
