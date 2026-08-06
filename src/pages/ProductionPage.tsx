import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, WashingMachine } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { statusLabels } from '../lib/order'
import { supabase } from '../lib/supabase'
import type { OrderRow, OrderStatus } from '../types/order'

const columns: OrderStatus[] = ['received','washing','drying','ironing','packing','ready']
const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  received:'washing', washing:'drying', drying:'ironing', ironing:'packing', packing:'ready', ready:'completed'
}

export function ProductionPage() {
  const [rows,setRows]=useState<OrderRow[]>([])
  const [message,setMessage]=useState('')

  const load=useCallback(async()=>{
    const {data,error}=await supabase.from('v100_orders_view').select('*').not('status','in','("completed","cancelled")').order('created_at')
    if(error)setMessage(error.message)
    else setRows((data as OrderRow[])||[])
  },[])

  useEffect(()=>{void load()},[load])

  const move=async(row:OrderRow)=>{
    const next=nextStatus[row.status]
    if(!next)return
    const {error}=await supabase.from('v100_orders').update({status:next,updated_at:new Date().toISOString()}).eq('id',row.id)
    if(error)setMessage(error.message)
    else await load()
  }

  return <>
    <PageHeader eyebrow="PRODUKSI" title="Antrian Cucian" description="Pindahkan order mengikuti tahapan proses laundry." />
    {message&&<div className="error-box inline-message">{message}</div>}
    <div className="production-board">
      {columns.map(status=><section className="production-column" key={status}>
        <header><b>{statusLabels[status]}</b><span>{rows.filter(r=>r.status===status).length}</span></header>
        <div className="production-cards">
          {rows.filter(r=>r.status===status).map(row=><article className="production-card" key={row.id}>
            <div><b>{row.order_no}</b><small>{row.customer_name}</small></div>
            {row.due_at&&<small>Selesai: {new Date(row.due_at).toLocaleString('id-ID')}</small>}
            <button onClick={()=>void move(row)}>{status==='ready'?'Selesaikan':'Tahap Berikutnya'}<ChevronRight size={15}/></button>
          </article>)}
          {rows.filter(r=>r.status===status).length===0&&<div className="production-empty"><WashingMachine size={24}/>Kosong</div>}
        </div>
      </section>)}
    </div>
  </>
}
