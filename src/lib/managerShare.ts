import {supabase} from './supabase'
export type ManagerShareRow={employee_id:string;full_name:string;percent:number;amount:number;updated_at:string}
export type ManagerReport={payroll_month:string;revenue:number;operating:number;employee_cost:number;profit_base:number;rows:ManagerShareRow[]}
export async function loadManagerReport(month:string):Promise<ManagerReport>{
 const {data,error}=await supabase.rpc('v113151_manager_report',{p_month:`${month.slice(0,7)}-01`})
 if(error)throw new Error(`Bagi hasil pengelola gagal dimuat: ${error.message}. Pastikan SQL 080 sudah dijalankan.`)
 if(!data||!Array.isArray(data.rows))throw new Error('Format bagi hasil pengelola tidak valid.')
 return data as ManagerReport
}
// Laporan rentang tanggal mengalokasikan hak bulanan sesuai proporsi hari,
// mengikuti alokasi tunjangan bulanan. Bukan pencatatan pembayaran kas.
export async function managerSharesForRange(from:string,to:string){
 const result:{month:string;report:ManagerReport;ratio:number}[]=[]
 const cursor=new Date(`${from.slice(0,7)}-01T00:00:00Z`)
 while(cursor.toISOString().slice(0,10)<=to){
  const month=cursor.toISOString().slice(0,7),y=cursor.getUTCFullYear(),m=cursor.getUTCMonth()
  const days=new Date(Date.UTC(y,m+1,0)).getUTCDate()
  const lo=month===from.slice(0,7)?Number(from.slice(8)):1
  const hi=month===to.slice(0,7)?Number(to.slice(8)):days
  result.push({month,report:await loadManagerReport(month),ratio:(hi-lo+1)/days})
  cursor.setUTCMonth(m+1)
 }
 return result
}
