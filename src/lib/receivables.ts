import {supabase} from './supabase'
import {readDashboardPages} from './dashboardPages'
import {businessDateKey} from './businessTime'
import type {OrderRow} from '../types/order'

export type ReceivableRow=OrderRow & {_exists_now?:boolean}
export const remainingReceivable=(row:OrderRow)=>Math.max(0,Number(row.total||0)-Number(row.paid_amount||0))
export function monthEndReceivable(month:string,today=businessDateKey()){
 if(!/^\d{4}-\d{2}$/.test(month))return ''
 const [year,m]=month.split('-').map(Number)
 if(m<1||m>12||year<1)return ''
 const date=new Date(`${month}-01T00:00:00Z`)
 date.setUTCMonth(date.getUTCMonth()+1,0)
 const end=date.toISOString().slice(0,10)
 return end>today?today:end
}
export async function loadReceivables(asOf:string|null):Promise<ReceivableRow[]>{
 if(!asOf){
  const {data,error}=await readDashboardPages(()=>supabase.from('v100_orders_view').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}))
  if(error)throw new Error(error.message)
  return (data as OrderRow[]).filter(r=>r.status!=='cancelled'&&remainingReceivable(r)>0)
 }
 const {data,error}=await supabase.rpc('v113168_receivables_as_of',{p_as_of:asOf})
 if(error){
  if(error.code==='PGRST202'||error.code==='42883')throw new Error('Laporan piutang per tanggal belum tersedia. Jalankan SQL 088 di Supabase, lalu klik Muat Ulang.')
  throw new Error(error.message)
 }
 if(!data||data.as_of!==asOf||!Array.isArray(data.rows))throw new Error('Respons laporan piutang tidak lengkap. Muat ulang laporan.')
 const rows=data.rows as ReceivableRow[]
 if(new Set(rows.map(r=>r.id)).size!==rows.length||rows.some(r=>!r.id||!Number.isFinite(Number(r.total))||!Number.isFinite(Number(r.paid_amount))||remainingReceivable(r)<=0))throw new Error('Rincian piutang tidak valid. Muat ulang laporan.')
 const total=rows.reduce((s,r)=>s+remainingReceivable(r),0)
 if(Number(data.count)!==rows.length||!Number.isFinite(Number(data.total))||Math.abs(total-Number(data.total))>.005)throw new Error('Total dan rincian piutang belum cocok. Muat ulang laporan.')
 return rows
}

export function receivablePaymentLabel(row:OrderRow){
 return remainingReceivable(row)<=0?'Lunas':Number(row.paid_amount||0)>0?'Cicilan':'Belum Bayar'
}
