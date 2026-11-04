import {supabase} from './supabase'
import type {OrderRow} from '../types/order'

// Fetch in small pages: still works when PostgREST caps each response at 1000 rows.
export type OrderFilters={payment:string;status:string;category:string;assignment:string;attention:string}
export type OrderSearchSummary={count:number;ready:number;overdue:number;receivable:number;unpaid_count:number}
export async function fetchOrderSearch(query:string,limit:number,startDate='',endDate='',filters?:OrderFilters){
  if(startDate&&endDate&&startDate>endDate)throw new Error('Tanggal mulai tidak boleh melewati tanggal akhir.')
  const rows:OrderRow[]=[]
  while(rows.length<limit){
    const size=Math.min(100,limit-rows.length)
    const {data,error}=await supabase.rpc(filters?'v113170_search_orders':'v113144_search_orders',{
      p_query:query.trim(),p_limit:size,p_offset:rows.length,p_start_date:startDate||null,p_end_date:endDate||null,
      ...(filters?{p_filters:filters}:{})
    })
    if(error)throw new Error(error.code==='PGRST202'
      ?`Pencarian belum siap. Jalankan SQL ${filters?'090':'079'} lalu muat ulang halaman.`
      :error.message)
    const page=(data||[]) as OrderRow[]
    rows.push(...page)
    if(page.length<size)break
  }
  return rows
}

export async function fetchOrderSearchSummary(query:string,startDate:string,endDate:string,filters:OrderFilters):Promise<OrderSearchSummary>{
 if(startDate&&endDate&&startDate>endDate)throw new Error('Tanggal mulai tidak boleh melewati tanggal akhir.')
 const {data,error}=await supabase.rpc('v113170_order_search_summary',{p_query:query.trim(),p_start_date:startDate||null,p_end_date:endDate||null,p_filters:filters})
 if(error)throw new Error(error.code==='PGRST202'||error.code==='42883'?'Ringkasan seluruh order belum tersedia. Jalankan SQL 090 di Supabase.':error.message)
 const keys=['count','ready','overdue','receivable','unpaid_count'] as const
 if(!data||keys.some(k=>data[k]===null||data[k]===undefined||!Number.isFinite(Number(data[k]))||Number(data[k])<0))throw new Error('Ringkasan order tidak lengkap. Muat ulang halaman.')
 return Object.fromEntries(keys.map(k=>[k,Number(data[k])])) as OrderSearchSummary
}

// Load related data for the displayed orders, including old orders outside the first 1000 rows.
export async function fetchOrderRelated<T>(table:string,columns:string,ids:string[],sort:string){
  const rows:T[]=[]
  for(let i=0;i<ids.length;i+=50){
    for(let offset=0;;offset+=100){
      const {data,error}=await supabase.from(table).select(columns).in('order_id',ids.slice(i,i+50))
        .order(sort,{ascending:false}).range(offset,offset+99)
      if(error)throw new Error(error.message)
      const page=(data||[]) as unknown as T[]
      rows.push(...page)
      if(page.length<100)break
    }
  }
  return rows
}
