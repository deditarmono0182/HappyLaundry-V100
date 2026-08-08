import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, CreditCard, FileSpreadsheet, FileText, Printer, ReceiptText, TrendingUp, Users, WalletCards } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatRupiah } from '../lib/format'
import { downloadXls, printPdf } from '../lib/exportData'
import { supabase } from '../lib/supabase'

interface OrderRow{
  id:string
  order_no:string
  customer_id:string
  total:number
  paid_amount:number
  payment_status:string
  status:string
  created_at:string
}

interface PaymentRow{
  id:string
  order_id:string
  amount:number
  method:string
  created_at:string
}

interface CashRow{
  id:string
  amount:number
  created_at:string
  category_name?:string|null
  group_name?:string|null
  description?:string|null
}

interface ItemRow{
  order_id:string
  service_name?:string
  quantity?:number
  qty?:number
  line_total?:number
  subtotal?:number
  total?:number
  price?:number
  unit_price?:number
  price_per_unit?:number
}

interface CustomerRow{
  id:string
  name:string
}

const todayISO=()=>{
  const d=new Date()
  const y=d.getFullYear()
  const m=String(d.getMonth()+1).padStart(2,'0')
  const day=String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}

const monthStartISO=()=>{
  const d=new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}

const endOfDay=(value:string)=>`${value}T23:59:59.999`
const startOfDay=(value:string)=>`${value}T00:00:00.000`

export function ReportsPage(){
  const [from,setFrom]=useState(monthStartISO())
  const [to,setTo]=useState(todayISO())
  const [appliedFrom,setAppliedFrom]=useState(monthStartISO())
  const [appliedTo,setAppliedTo]=useState(todayISO())
  const [orders,setOrders]=useState<OrderRow[]>([])
  const [payments,setPayments]=useState<PaymentRow[]>([])
  const [cash,setCash]=useState<CashRow[]>([])
  const [items,setItems]=useState<ItemRow[]>([])
  const [customers,setCustomers]=useState<CustomerRow[]>([])
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const fromISO=startOfDay(appliedFrom)
    const toISO=endOfDay(appliedTo)

    const [orderRes,paymentRes,cashRes,itemRes,customerRes]=await Promise.all([
      supabase.from('v100_orders')
        .select('id,order_no,customer_id,total,paid_amount,payment_status,status,created_at')
        .gte('created_at',fromISO).lte('created_at',toISO)
        .neq('status','cancelled'),
      supabase.from('v100_payments')
        .select('id,order_id,amount,method,created_at')
        .gte('created_at',fromISO).lte('created_at',toISO),
      supabase.from('v106_expenses_view')
        .select('id,amount,created_at,category_name,group_name,description')
        .gte('created_at',fromISO).lte('created_at',toISO),
      supabase.from('v100_order_items')
        .select('*'),
      supabase.from('v100_customers')
        .select('id,name')
    ])

    const error=orderRes.error||paymentRes.error||cashRes.error||itemRes.error||customerRes.error
    if(error){
      setMessage(error.message)
      setOrders([]);setPayments([]);setCash([]);setItems([]);setCustomers([])
    }else{
      setOrders((orderRes.data as OrderRow[])||[])
      setPayments((paymentRes.data as PaymentRow[])||[])
      setCash((cashRes.data as CashRow[])||[])
      setItems((itemRes.data as ItemRow[])||[])
      setCustomers((customerRes.data as CustomerRow[])||[])
    }
    setLoading(false)
  },[appliedFrom,appliedTo])

  useEffect(()=>{void load()},[load])

  const orderIds=useMemo(()=>new Set(orders.map(o=>o.id)),[orders])

  const report=useMemo(()=>{
    const omzet=payments.reduce((sum,p)=>sum+Number(p.amount||0),0)
    const expense=cash.reduce((sum,c)=>sum+Number(c.amount||0),0)
    const receivable=orders.reduce((sum,o)=>sum+Math.max(0,Number(o.total||0)-Number(o.paid_amount||0)),0)
    const completed=orders.filter(o=>o.status==='completed'||o.status==='ready').length
    const avg=orders.length?omzet/orders.length:0

    const paymentMethods:Record<string,number>={}
    for(const p of payments){
      const key=(p.method||'lainnya').toLowerCase()
      paymentMethods[key]=(paymentMethods[key]||0)+Number(p.amount||0)
    }

    const serviceMap:Record<string,{qty:number,revenue:number}>={}
    for(const i of items){
      if(!orderIds.has(i.order_id))continue
      const key=i.service_name||'Layanan'
      if(!serviceMap[key])serviceMap[key]={qty:0,revenue:0}

      const qty=Number(i.quantity??i.qty??0)
      const unitPrice=Number(i.price??i.unit_price??i.price_per_unit??0)
      const revenue=Number(
        i.line_total ??
        i.subtotal ??
        i.total ??
        (unitPrice*qty) ??
        0
      )

      serviceMap[key].qty+=qty
      serviceMap[key].revenue+=Number.isFinite(revenue)?revenue:0
    }

    const customerName=new Map(customers.map(c=>[c.id,c.name]))
    const customerMap:Record<string,{name:string,orders:number,total:number}>={}
    for(const o of orders){
      const key=o.customer_id
      if(!customerMap[key])customerMap[key]={name:customerName.get(key)||'Pelanggan',orders:0,total:0}
      customerMap[key].orders+=1
      customerMap[key].total+=Number(o.total||0)
    }

    const dayMap:Record<string,number>={}
    for(const p of payments){
      const key=new Date(p.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short'})
      dayMap[key]=(dayMap[key]||0)+Number(p.amount||0)
    }

    return{
      omzet,
      expense,
      net:omzet-expense,
      receivable,
      orders:orders.length,
      completed,
      avg,
      paymentMethods:Object.entries(paymentMethods).sort((a,b)=>b[1]-a[1]),
      services:Object.entries(serviceMap).map(([name,v])=>({name,...v})).sort((a,b)=>b.qty-a.qty).slice(0,8),
      customers:Object.values(customerMap).sort((a,b)=>b.total-a.total).slice(0,8),
      daily:Object.entries(dayMap)
    }
  },[orders,payments,cash,items,customers,orderIds])

  const maxDaily=Math.max(1,...report.daily.map(([,v])=>v))
  const maxMethod=Math.max(1,...report.paymentMethods.map(([,v])=>v))

  const setToday=()=>{
    const t=todayISO()
    setFrom(t);setTo(t);setAppliedFrom(t);setAppliedTo(t)
  }

  const setMonth=()=>{
    const f=monthStartISO(),t=todayISO()
    setFrom(f);setTo(t);setAppliedFrom(f);setAppliedTo(t)
  }

  const apply=()=>{
    if(!from||!to)return
    setAppliedFrom(from)
    setAppliedTo(to)
  }

  const ownerExportOptions=()=>({
    title:'Laporan Owner',
    filename:`laporan-owner-${appliedFrom}-${appliedTo}`,
    subtitle:`Periode ${appliedFrom} s/d ${appliedTo}`,
    headers:['Bagian','Nama','Qty/Jumlah','Nilai'],
    rows:[
      ['Ringkasan','Omzet',payments.length,report.omzet],
      ['Ringkasan','Pengeluaran',cash.length,report.expense],
      ['Ringkasan','Laba Bersih','-',report.net],
      ['Ringkasan','Piutang',orders.filter(o=>Number(o.total)>Number(o.paid_amount)).length,report.receivable],
      ['Ringkasan','Order',report.orders,Math.round(report.avg)],
      ...report.paymentMethods.map(([name,value])=>['Metode Pembayaran',name.toUpperCase(),'-',value]),
      ...report.services.map(s=>['Layanan',s.name,s.qty,s.revenue]),
      ...report.customers.map(c=>['Pelanggan',c.name,c.orders,c.total])
    ],
    summary:[
      ['Omzet',report.omzet],
      ['Pengeluaran',report.expense],
      ['Laba Bersih',report.net],
      ['Piutang',report.receivable]
    ] as Array<[string,string|number]>
  })

  const print=()=>window.print()

  const exportCSV=()=>{
    const rows=[
      ['HappyLaundry Enterprise V104.1 - Laporan Owner'],
      ['Periode',`${appliedFrom} s/d ${appliedTo}`],
      [],
      ['Ringkasan','Nilai'],
      ['Omzet',report.omzet],
      ['Pengeluaran',report.expense],
      ['Laba Bersih',report.net],
      ['Piutang',report.receivable],
      ['Order',report.orders],
      ['Rata-rata Order',Math.round(report.avg)],
      [],
      ['Metode Pembayaran','Jumlah'],
      ...report.paymentMethods.map(([name,value])=>[name,value]),
      [],
      ['Layanan','Qty','Omzet'],
      ...report.services.map(s=>[s.name,s.qty,s.revenue]),
      [],
      ['Pelanggan','Jumlah Order','Total Transaksi'],
      ...report.customers.map(c=>[c.name,c.orders,c.total])
    ]
    const csv=rows.map(row=>row.map(cell=>`"${String(cell??'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a')
    a.href=url
    a.download=`laporan-owner-${appliedFrom}-${appliedTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return <>
    <PageHeader
      eyebrow="ENTERPRISE REPORTING"
      title="Laporan Owner"
      description="Analisis omzet, kas, piutang, pelanggan, dan layanan dari transaksi aktual."
      action={<div className="report-actions">
        <button className="secondary-button" onClick={()=>downloadXls(ownerExportOptions())}><FileSpreadsheet size={17}/>XLS</button>
        <button className="secondary-button" onClick={()=>printPdf(ownerExportOptions())}><FileText size={17}/>PDF</button>
        <button className="secondary-button" onClick={exportCSV}><FileSpreadsheet size={17}/>CSV</button>
        <button className="secondary-button" onClick={print}><Printer size={17}/>Cetak</button>
      </div>}
    />

    <section className="panel report-filter">
      <label>Dari<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Sampai<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <button className="secondary-button" onClick={setToday}>Hari Ini</button>
      <button className="secondary-button" onClick={setMonth}>Bulan Ini</button>
      <button className="primary-button" onClick={apply}><CalendarDays size={17}/>Terapkan</button>
    </section>

    {message&&<div className="error-box inline-message">{message}</div>}

    <section className="stats-grid report-stats">
      <StatCard icon={TrendingUp} label="Omzet" value={formatRupiah(report.omzet)} caption={`${payments.length} pembayaran`}/>
      <StatCard icon={WalletCards} label="Pengeluaran" value={formatRupiah(report.expense)} caption="Kas keluar"/>
      <StatCard icon={TrendingUp} label="Laba Bersih" value={formatRupiah(report.net)} caption="Omzet dikurangi pengeluaran"/>
      <StatCard icon={ReceiptText} label="Piutang" value={formatRupiah(report.receivable)} caption="Sisa tagihan"/>
      <StatCard icon={BarChart3} label="Order" value={String(report.orders)} caption={`${report.completed} selesai/siap`}/>
      <StatCard icon={TrendingUp} label="Rata-rata Order" value={formatRupiah(report.avg)} caption="Nilai rata-rata transaksi"/>
    </section>

    <section className="report-grid">
      <article className="panel report-card">
        <div className="panel-heading"><div><h3>Omzet Harian</h3><p>Pembayaran masuk pada periode terpilih.</p></div></div>
        {loading?<div className="table-empty">Memuat laporan...</div>:report.daily.length===0?<div className="report-empty">Belum ada pembayaran di periode ini.</div>:
        <div className="report-bars">
          {report.daily.map(([label,value])=><div className="report-bar-row" key={label}>
            <span>{label}</span><div><i style={{width:`${Math.max(4,(value/maxDaily)*100)}%`}}/></div><b>{formatRupiah(value)}</b>
          </div>)}
        </div>}
      </article>

      <article className="panel report-card">
        <div className="panel-heading"><div><h3>Metode Pembayaran</h3><p>Komposisi pembayaran periode terpilih.</p></div></div>
        {report.paymentMethods.length===0?<div className="report-empty">Belum ada pembayaran.</div>:
        <div className="report-bars">
          {report.paymentMethods.map(([method,value])=><div className="report-bar-row" key={method}>
            <span>{method.toUpperCase()}</span><div><i style={{width:`${Math.max(4,(value/maxMethod)*100)}%`}}/></div><b>{formatRupiah(value)}</b>
          </div>)}
        </div>}
      </article>

      <article className="panel report-card">
        <div className="panel-heading"><div><h3>Layanan Terlaris</h3><p>Berdasarkan order pada periode terpilih.</p></div></div>
        {report.services.length===0?<div className="report-empty">Belum ada data layanan.</div>:
        <div className="ranking-list">
          {report.services.map((s,index)=><div key={s.name}><span className="rank-no">{index+1}</span><div><b>{s.name}</b><small>{s.qty.toLocaleString('id-ID')} unit</small></div><strong>{s.revenue>0?formatRupiah(s.revenue):'-'}</strong></div>)}
        </div>}
      </article>

      <article className="panel report-card">
        <div className="panel-heading"><div><h3>Pelanggan Terbaik</h3><p>Berdasarkan total nilai order.</p></div></div>
        {report.customers.length===0?<div className="report-empty">Belum ada data pelanggan.</div>:
        <div className="ranking-list">
          {report.customers.map((c,index)=><div key={`${c.name}-${index}`}><span className="rank-no">{index+1}</span><div><b>{c.name}</b><small>{c.orders} order</small></div><strong>{formatRupiah(c.total)}</strong></div>)}
        </div>}
      </article>
    </section>
  </>
}
