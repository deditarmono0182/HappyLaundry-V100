import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, Banknote, CalendarCheck2, CalendarDays, CheckCircle2, CircleDollarSign,
  Clock3, FileText, Landmark, PackageCheck, ReceiptText, Smartphone, Target,
  TrendingUp, WalletCards, WashingMachine
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { formatIDR } from '../lib/format'
import { supabase } from '../lib/supabase'
import { fetchFinancialSummary, type FinancialSummary } from '../lib/financialSummary'
import { addBusinessDays, businessDateKey, businessDateLabel } from '../lib/businessTime'
import type { OrderRow } from '../types/order'

type PaymentRow={
  amount:number
  method:'cash'|'qris'|'transfer'|'other'
  created_at:string
}

type ExpenseRow={
  id:string
  expense_date:string
  amount:number
  category_name:string
  description:string|null
}

type PeriodPreset='today'|'7d'|'month'|'custom'

const sections=[
  {
    title:'Ringkasan & Analisis',
    items:[
      {to:'/finance',title:'Keuangan',description:'Pendapatan, pengeluaran, biaya operasional, dan ringkasan keuangan.',icon:CircleDollarSign,tone:'blue'},
      {to:'/profit-loss',title:'Laba Rugi',description:'Lihat laba bersih operasional, cadangan, margin, dan detail sumber.',icon:TrendingUp,tone:'green'},
      {to:'/profit-target',title:'Target Bisnis',description:'Pantau target omzet, laba, jumlah order, dan progres bulan berjalan.',icon:Target,tone:'cyan'},
      {to:'/reports',title:'Laporan Owner',description:'Ringkasan laporan bisnis dan export data Owner.',icon:BarChart3,tone:'slate'}
    ]
  },
  {
    title:'Kas & Tagihan',
    items:[
      {to:'/receivables',title:'Piutang',description:'Daftar order belum lunas dan sisa tagihan pelanggan.',icon:AlertTriangle,tone:'amber'},
      {to:'/cash',title:'Kas Harian',description:'Catat pemasukan dan pengeluaran kas operasional harian.',icon:WalletCards,tone:'teal'},
      {to:'/daily-closing',title:'Closing Harian',description:'Cocokkan kas sistem dengan uang fisik dan simpan snapshot akhir hari.',icon:CalendarCheck2,tone:'purple'}
    ]
  },
  {
    title:'Akses Cepat',
    items:[
      {to:'/finance/income',title:'Detail Pemasukan',description:'Buka rincian sumber pemasukan periode keuangan.',icon:Landmark,tone:'pink'},
      {to:'/finance/expenses',title:'Detail Pengeluaran',description:'Buka rincian pengeluaran dan bukti transaksi.',icon:ReceiptText,tone:'red'},
      {to:'/payroll',title:'Payroll / Komisi',description:'Akses payroll, komisi, bonus, kas bon, dan pembayaran gaji.',icon:FileText,tone:'violet'}
    ]
  }
] as const

export function FinanceReportsHubPage(){
  const navigate=useNavigate()
  const todayKey=businessDateKey(new Date())
  const [preset,setPreset]=useState<PeriodPreset>('7d')
  const [from,setFrom]=useState(addBusinessDays(todayKey,-6))
  const [to,setTo]=useState(todayKey)
  const [orders,setOrders]=useState<OrderRow[]>([])
  const [payments,setPayments]=useState<PaymentRow[]>([])
  const [expenses,setExpenses]=useState<ExpenseRow[]>([])
  const [message,setMessage]=useState('')
  const [financial,setFinancial]=useState<FinancialSummary|null>(null)

  useEffect(()=>{
    let alive=true
    const load=async()=>{
      const [orderRes,paymentRes,expenseRes]=await Promise.all([
        supabase.from('v100_orders_view').select('*').order('created_at',{ascending:false}),
        supabase.from('v100_payments').select('amount,method,created_at').order('created_at',{ascending:false}),
        supabase.from('v106_expenses_view').select('id,expense_date,amount,category_name,description').order('expense_date',{ascending:false})
      ])
      if(!alive)return
      const error=orderRes.error||paymentRes.error||expenseRes.error
      if(error){
        setMessage(error.message)
        return
      }
      setOrders((orderRes.data as OrderRow[])||[])
      setPayments((paymentRes.data as PaymentRow[])||[])
      setExpenses((expenseRes.data as ExpenseRow[])||[])
      setMessage('')
    }
    void load()
    const onFocus=()=>void load()
    window.addEventListener('focus',onFocus)
    return()=>{alive=false;window.removeEventListener('focus',onFocus)}
  },[])

  useEffect(()=>{
    let alive=true
    const loadSummary=async()=>{
      try{
        const result=await fetchFinancialSummary(from,to)
        if(alive)setFinancial(result)
      }catch(error){
        if(alive)setMessage(error instanceof Error?error.message:'Gagal memuat ringkasan laba.')
      }
    }
    void loadSummary()
    return()=>{alive=false}
  },[from,to])

  const setQuickPeriod=(value:Exclude<PeriodPreset,'custom'>)=>{
    const today=businessDateKey(new Date())
    setPreset(value)
    if(value==='today'){setFrom(today);setTo(today)}
    if(value==='7d'){setFrom(addBusinessDays(today,-6));setTo(today)}
    if(value==='month'){setFrom(`${today.slice(0,7)}-01`);setTo(today)}
  }
  const periodLabel=preset==='today'?'Hari Ini':preset==='7d'?'7 Hari':preset==='month'?'Bulan Ini':`${from} s/d ${to}`
  const periodOrders=useMemo(()=>orders.filter(row=>{const key=businessDateKey(row.created_at);return row.status!=='cancelled'&&key>=from&&key<=to}),[orders,from,to])
  const periodPayments=useMemo(()=>payments.filter(row=>{const key=businessDateKey(row.created_at);return key>=from&&key<=to}),[payments,from,to])
  const periodExpenses=useMemo(()=>expenses.filter(row=>row.expense_date>=from&&row.expense_date<=to),[expenses,from,to])

  const omzetToday=periodOrders.reduce((sum,row)=>sum+Number(row.total||0),0)
  const cashInToday=periodPayments.reduce((sum,row)=>sum+Number(row.amount||0),0)
  const expenseToday=periodExpenses.reduce((sum,row)=>sum+Number(row.amount||0),0)
  const receivable=orders.filter(row=>row.status!=='cancelled').reduce((sum,row)=>sum+Math.max(0,Number(row.total||0)-Number(row.paid_amount||0)),0)
  const profitToday=financial?.operatingNet??(omzetToday-expenseToday)
  const employeeCostPeriod=financial?.employeeCost??0
  const operatingExpensePeriod=financial?.operating??expenseToday

  const paymentMethodSummary=useMemo(()=>{
    const total=periodPayments.reduce((sum,row)=>sum+Number(row.amount||0),0)
    return [
      {key:'cash',label:'Tunai',icon:Banknote,amount:periodPayments.filter(x=>x.method==='cash').reduce((s,x)=>s+Number(x.amount||0),0)},
      {key:'qris',label:'QRIS',icon:Smartphone,amount:periodPayments.filter(x=>x.method==='qris').reduce((s,x)=>s+Number(x.amount||0),0)},
      {key:'transfer',label:'Transfer',icon:Landmark,amount:periodPayments.filter(x=>x.method==='transfer').reduce((s,x)=>s+Number(x.amount||0),0)}
    ].map(row=>({...row,percentage:total>0?Math.round(row.amount/total*100):0}))
  },[periodPayments])

  const statusRows=useMemo(()=>[
    {key:'received',label:'Diterima',icon:PackageCheck,count:orders.filter(x=>x.status==='received').length},
    {key:'washing',label:'Dicuci',icon:WashingMachine,count:orders.filter(x=>x.status==='washing').length},
    {key:'drying',label:'Dikeringkan',icon:Clock3,count:orders.filter(x=>x.status==='drying').length},
    {key:'ironing',label:'Disetrika',icon:TrendingUp,count:orders.filter(x=>x.status==='ironing').length},
    {key:'packing',label:'Packing',icon:PackageCheck,count:orders.filter(x=>x.status==='packing').length},
    {key:'ready',label:'Siap Diambil',icon:WalletCards,count:orders.filter(x=>x.status==='ready').length},
    {key:'completed',label:'Selesai Periode',icon:CheckCircle2,count:periodOrders.filter(x=>x.status==='completed').length}
  ],[orders,periodOrders])

  const statusTotal=Math.max(1,statusRows.reduce((sum,row)=>sum+row.count,0))

  const paymentStatusRows=useMemo(()=>{
    const active=periodOrders
    const unpaid=active.filter(row=>Number(row.paid_amount||0)<=0).length
    const partial=active.filter(row=>Number(row.paid_amount||0)>0&&Number(row.paid_amount||0)<Number(row.total||0)).length
    const paid=active.filter(row=>Number(row.total||0)>0&&Number(row.paid_amount||0)>=Number(row.total||0)).length
    const total=Math.max(1,unpaid+partial+paid)
    return [
      {key:'unpaid',label:'Belum Bayar',count:unpaid,percentage:Math.round(unpaid/total*100)},
      {key:'partial',label:'DP / Sebagian',count:partial,percentage:Math.round(partial/total*100)},
      {key:'paid',label:'Lunas',count:paid,percentage:Math.round(paid/total*100)}
    ]
  },[periodOrders])

  const chart=useMemo(()=>{
    const start=from<=to?from:to
    const end=from<=to?to:from
    const keys:string[]=[]
    for(let key=start;key<=end;key=addBusinessDays(key,1))keys.push(key)

    const bucketCount=Math.min(7,Math.max(1,keys.length))
    const bucketSize=Math.ceil(keys.length/bucketCount)

    return Array.from({length:bucketCount},(_,index)=>{
      const bucketKeys=keys.slice(index*bucketSize,Math.min(keys.length,(index+1)*bucketSize))
      const bucketStart=bucketKeys[0]||start
      const bucketEnd=bucketKeys[bucketKeys.length-1]||bucketStart
      const keySet=new Set(bucketKeys)
      const bucketOrders=orders.filter(row=>row.status!=='cancelled'&&keySet.has(businessDateKey(row.created_at)))
      const bucketPayments=payments.filter(row=>keySet.has(businessDateKey(row.created_at)))

      let label=''
      if(bucketKeys.length<=1){
        label=businessDateLabel(`${bucketStart}T12:00:00+07:00`,{day:'2-digit',month:'short'})
      }else{
        const a=businessDateLabel(`${bucketStart}T12:00:00+07:00`,{day:'2-digit',month:'short'})
        const b=businessDateLabel(`${bucketEnd}T12:00:00+07:00`,{day:'2-digit',month:'short'})
        label=`${a}–${b}`
      }

      return{
        key:`${bucketStart}-${bucketEnd}`,
        label,
        omzet:bucketOrders.reduce((sum,row)=>sum+Number(row.total||0),0),
        cashIn:bucketPayments.reduce((sum,row)=>sum+Number(row.amount||0),0),
        orders:bucketOrders.length
      }
    })
  },[orders,payments,from,to])

  const maxChart=Math.max(1,...chart.flatMap(row=>[row.omzet,row.cashIn]))
  const maxOrders=Math.max(1,...chart.map(row=>row.orders))
  const chartWidth=760,chartHeight=255,padX=38,padY=28
  const innerW=chartWidth-padX*2,innerH=chartHeight-padY*2
  const groupW=innerW/Math.max(1,chart.length)
  const moneyY=(value:number)=>padY+innerH-(value/maxChart)*innerH
  const orderPoints=chart.map((row,index)=>({
    x:padX+groupW*(index+.5),
    y:padY+innerH-(row.orders/maxOrders)*innerH
  }))

  return <div className="finance-reports-hub colorful-finance-hub">
    <PageHeader
      eyebrow="KONTROL OWNER"
      title="Keuangan & Laporan"
      description="Pantau kondisi keuangan, transaksi, status order, dan laporan bisnis dalam satu tempat."
    />

    <section className="panel finance-hub-period-panel">
      <div className="finance-hub-period-title"><CalendarDays size={14}/><b>Periode</b></div>
      <div className="finance-hub-quick-periods">
        <button type="button" className={preset==='today'?'is-active':''} onClick={()=>setQuickPeriod('today')}>Hari Ini</button>
        <button type="button" className={preset==='7d'?'is-active':''} onClick={()=>setQuickPeriod('7d')}>7 Hari</button>
        <button type="button" className={preset==='month'?'is-active':''} onClick={()=>setQuickPeriod('month')}>Bulan Ini</button>
      </div>
      <div className="finance-hub-custom-period">
        <label><span>Dari</span><input type="date" value={from} onChange={e=>{setFrom(e.target.value);setPreset('custom')}}/></label>
        <label><span>Sampai</span><input type="date" value={to} onChange={e=>{setTo(e.target.value);setPreset('custom')}}/></label>
      </div>
      <span className="finance-hub-current-period">{periodLabel}</span>
    </section>

    {message&&<div className="error-box">{message}</div>}

    <section className="finance-live-kpis">
      <button type="button" className="finance-live-kpi tone-blue" onClick={()=>navigate('/finance')}>
        <span className="finance-kpi-icon"><BarChart3 size={22}/></span>
        <span><small>Omzet / Barang Masuk</small><b>{formatIDR(omzetToday)}</b><em>{periodOrders.length} order • {periodLabel}</em></span>
      </button>
      <button type="button" className="finance-live-kpi tone-green" onClick={()=>navigate('/finance/income')}>
        <span className="finance-kpi-icon"><WalletCards size={22}/></span>
        <span><small>Kas Masuk</small><b>{formatIDR(cashInToday)}</b><em>Pembayaran diterima • {periodLabel}</em></span>
      </button>
      <button type="button" className="finance-live-kpi tone-red" onClick={()=>navigate('/finance/expenses')}>
        <span className="finance-kpi-icon"><ReceiptText size={22}/></span>
        <span><small>Pengeluaran</small><b>{formatIDR(operatingExpensePeriod)}</b><em>Biaya operasional • {periodLabel}</em></span>
      </button>
      <button type="button" className="finance-live-kpi tone-cyan" onClick={()=>navigate('/payroll')}>
        <span className="finance-kpi-icon"><FileText size={22}/></span>
        <span><small>Biaya Karyawan</small><b>{formatIDR(employeeCostPeriod)}</b><em>Gaji, tunjangan, bonus, bagi hasil & komisi</em></span>
      </button>
      <button type="button" className="finance-live-kpi tone-purple" onClick={()=>navigate('/profit-loss')}>
        <span className="finance-kpi-icon"><TrendingUp size={22}/></span>
        <span><small>Laba Bersih Operasional</small><b>{formatIDR(profitToday)}</b><em>Omzet - biaya operasional - biaya karyawan</em></span>
      </button>
      <button type="button" className="finance-live-kpi tone-amber" onClick={()=>navigate('/receivables')}>
        <span className="finance-kpi-icon"><Clock3 size={22}/></span>
        <span><small>Piutang Aktif</small><b>{formatIDR(receivable)}</b><em>Klik untuk lihat tagihan</em></span>
      </button>
    </section>

    <section className="finance-analytics-grid">
      <article className="panel finance-main-chart-card">
        <div className="finance-analytics-heading">
          <div><h3><BarChart3 size={19}/> Grafik Keuangan & Order</h3><p>Omzet, kas masuk, dan jumlah order pada periode yang dipilih.</p></div>
          <span className="finance-period-pill">{periodLabel}</span>
        </div>
        <div className="finance-chart-wrap">
          <div className="finance-chart-legend">
            <span className="legend-omzet">Omzet / Barang Masuk</span>
            <span className="legend-cash">Kas Masuk</span>
            <span className="legend-orders">Jumlah Order</span>
          </div>
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`Grafik keuangan dan order ${periodLabel}`}>
            {[0,1,2,3,4].map(level=>{
              const y=padY+(innerH/4)*level
              return <line key={level} x1={padX} x2={chartWidth-padX} y1={y} y2={y} className="finance-grid-line"/>
            })}
            {chart.map((row,index)=>{
              const center=padX+groupW*(index+.5)
              const y1=moneyY(row.omzet),y2=moneyY(row.cashIn)
              return <g key={row.key}>
                <rect x={center-19} y={y1} width="15" height={Math.max(2,padY+innerH-y1)} rx="4" className="finance-bar-omzet"/>
                <rect x={center+4} y={y2} width="15" height={Math.max(2,padY+innerH-y2)} rx="4" className="finance-bar-cash"/>
              </g>
            })}
            <polyline points={orderPoints.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" className="finance-order-line"/>
            {orderPoints.map((point,index)=><circle key={chart[index].key} cx={point.x} cy={point.y} r="4.5" className="finance-order-point"/>)}
          </svg>
          <div className="finance-chart-labels">
            {chart.map(row=><span key={row.key}><b>{row.label}</b><small>{row.orders} order</small></span>)}
          </div>
        </div>
      </article>

      <article className="panel finance-status-card">
        <div className="finance-analytics-heading"><div><h3>Status Order</h3><p>Kondisi order aktif saat ini.</p></div></div>
        <div className="finance-status-list">
          {statusRows.map(row=>{
            const Icon=row.icon
            const percentage=Math.round(row.count/statusTotal*100)
            return <div className={`finance-status-row status-${row.key}`} key={row.key}>
              <span className="finance-status-icon"><Icon size={15}/></span>
              <span className="finance-status-copy"><b>{row.label}</b><span><i style={{width:`${percentage}%`}}/></span></span>
              <strong>{row.count}</strong>
              <small>{percentage}%</small>
            </div>
          })}
        </div>
      </article>

      <div className="finance-side-stack">
        <article className="panel finance-payment-status-card">
          <div className="finance-analytics-heading"><div><h3>Status Pembayaran</h3></div><button type="button" onClick={()=>navigate('/receivables')}>Lihat Detail →</button></div>
          <div className="finance-payment-status-list">
            {paymentStatusRows.map(row=><div className={`finance-payment-status payment-${row.key}`} key={row.key}>
              <div><b>{row.label}</b><strong>{row.count} order</strong></div>
              <span><i style={{width:`${row.percentage}%`}}/></span>
              <small>{row.percentage}%</small>
            </div>)}
          </div>
        </article>

        <article className="panel finance-payment-method-card">
          <div className="finance-analytics-heading"><div><h3>Metode Pembayaran</h3></div><button type="button" onClick={()=>navigate('/finance/income')}>Lihat Detail →</button></div>
          <div className="finance-payment-method-list">
            {paymentMethodSummary.map(row=>{
              const Icon=row.icon
              return <div className={`finance-method-row method-${row.key}`} key={row.key}>
                <span className="finance-method-icon"><Icon size={16}/></span>
                <span><b>{row.label}</b><small>{formatIDR(row.amount)}</small></span>
                <span className="finance-method-bar"><i style={{width:`${row.percentage}%`}}/></span>
                <strong>{row.percentage}%</strong>
              </div>
            })}
          </div>
        </article>
      </div>
    </section>

    <section className="finance-hub-menu-panel">
      <div className="finance-hub-menu-heading">
        <div><h3>Keuangan & Laporan</h3><p>Semua laporan dan kontrol keuangan tetap tersedia di sini.</p></div>
      </div>
      {sections.map(section=><div className="finance-hub-section" key={section.title}>
        <h2>{section.title}</h2>
        <div className="finance-hub-grid">
          {section.items.map(item=>{
            const Icon=item.icon
            return <button type="button" className={`finance-hub-card hub-tone-${item.tone}`} key={item.to} onClick={()=>navigate(item.to)}>
              <span className="finance-hub-icon"><Icon size={22}/></span>
              <span className="finance-hub-copy"><b>{item.title}</b><small>{item.description}</small></span>
              <span className="finance-hub-arrow">→</span>
            </button>
          })}
        </div>
      </div>)}
    </section>
  </div>
}
