import {supabase} from './supabase'
import type {OrderRow} from '../types/order'

// Fetch in small pages: still works when PostgREST caps each response at 1000 rows.
export async function fetchOrderSearch(query:string,limit:number,startDate='',endDate=''){
  if(startDate&&endDate&&startDate>endDate)throw new Error('Tanggal mulai tidak boleh melewati tanggal akhir.')
  const rows:OrderRow[]=[]
  while(rows.length<limit){
    const size=Math.min(100,limit-rows.length)
    const {data,error}=await supabase.rpc('v113144_search_orders',{
      p_query:query.trim(),p_limit:size,p_offset:rows.length,p_start_date:startDate||null,p_end_date:endDate||null
    })
    if(error)throw new Error(error.code==='PGRST202'
      ?'Pencarian belum siap. Jalankan SQL 079 lalu muat ulang halaman.'
      :error.message)
    const page=(data||[]) as OrderRow[]
    rows.push(...page)
    if(page.length<size)break
  }
  return rows
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
