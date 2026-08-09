import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CalendarDays, CircleDollarSign, Crosshair, Eye, Landmark,
  Pencil, ReceiptText, Save, Target, TrendingDown, TrendingUp, UsersRound, WalletCards
} from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../lib/auth'
import { formatRupiah } from '../lib/format'
import { supabase } from '../lib/supabase'

interface PaymentRow{
  id:string
  order_id:string
  amount:number
  method:string
  created_at:string
}
interface ExpenseRow{
  id:string
  expense_date:string
  amount:number
  category_name:string
  description:string|null
}
interface OrderRow{
  id:string
  order_no:string
  customer_name:string
  total:number
  paid_amount:number
  status:string
  created_at:string
}
interface OrderItem{
  order_id:string
  service_id:string|null
  service_name:string
  subtotal:number
}
interface Employee{
  id:string
  full_name:string
}
interface Attendance{
  employee_id:string
  attendance_date:string
  status:string
}
interface PayrollSetting{
  employee_id:string
  attendance_rate:number
  monthly_allowance:number
}
interface PayrollShare{
  employee_id:string
  category:string
  share_percent:number
}
interface PayrollAdjustment{
  employee_id:string
  payroll_month:string
  bonus:number
}
interface Service{
  id:string
  category:string
}
interface TargetRow{
  month_start:string
  revenue_target:number
  profit_target:number
  order_target:number
  note:string|null
  updated_at:string
}
interface PayrollRow{
  employee:Employee
  presentDays:number
  attendancePay:number
  allowance:number
  bonus:number
  revenueShare:number
  total:number
}

type DetailType='revenue'|'expense'|'profit'|'receivable'

const pad=(n:number)=>String(n).padStart(2,'0')
const monthKey=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-01`
const monthLabel=(d:Date)=>d.toLocaleDateString('id-ID',{month:'long',year:'numeric'})
const inMonth=(value:string,d:Date)=>{
  const x=new Date(value)
  return x.getFullYear()===d.getFullYear()&&x.getMonth()===d.getMonth()
}
const percent=(value:number,target:number)=>target>0?Math.max(0,(value/target)*100):0
const capPercent=(value:number)=>Math.min(100,Math.max(0,value))
const changePercent=(current:number,previous:number)=>{
  if(previous<=0)return current>0?100:0
  return ((current-previous)/previous)*100
}

export function ProfitTargetDashboardPage(){
  const {profile}=useAuth()
  const isOwner=profile?.role==='owner'
  const [payments,setPayments]=useState<PaymentRow[]>([])
  const [expenses,setExpenses]=useState<ExpenseRow[]>([])
  const [orders,setOrders]=useState<OrderRow[]>([])
  const [items,setItems]=useState<OrderItem[]>([])
  const [employees,setEmployees]=useState<Employee[]>([])
  const [attendance,setAttendance]=useState<Attendance[]>([])
  const [payrollSettings,setPayrollSettings]=useState<PayrollSetting[]>([])
  const [payrollShares,setPayrollShares]=useState<PayrollShare[]>([])
  const [payrollAdjustments,setPayrollAdjustments]=useState<PayrollAdjustment[]>([])
  const [services,setServices]=useState<Service[]>([])
  const [target,setTarget]=useState<TargetRow|null>(null)
  const [targetOpen,setTargetOpen]=useState(false)
  const [detailType,setDetailType]=useState<DetailType|null>(null)
  const [targetDraft,setTargetDraft]=useState({revenue_target:'',profit_target:'',order_target:'',note:''})
  const [message,setMessage]=useState('')
  const [success,setSuccess]=useState('')
  const [busy,setBusy]=useState(false)

  const now=new Date()
  const currentMonth=new Date(now.getFullYear(),now.getMonth(),1)
  const previousMonth=new Date(now.getFullYear(),now.getMonth()-1,1)
  const sixMonthStart=new Date(now.getFullYear(),now.getMonth()-5,1)
  const currentMonthStart=monthKey(currentMonth)

  const load=useCallback(async()=>{
    setMessage('')
    const startISO=sixMonthStart.toISOString()
    const startDate=monthKey(sixMonthStart)
    const [p,e,o,i,emp,a,ps,shr,adj,sv,t]=await Promise.all([
      supabase.from('v100_payments')
        .select('id,order_id,amount,method,created_at')
        .gte('created_at',startISO)
        .order('created_at'),
      supabase.from('v106_expenses_view')
        .select('id,expense_date,amount,category_name,description')
        .gte('expense_date',startDate)
        .order('expense_date'),
      supabase.from('v100_orders_view')
        .select('id,order_no,customer_name,total,paid_amount,status,created_at'),
      supabase.from('v100_order_items')
        .select('order_id,service_id,service_name,subtotal'),
      supabase.from('v109_users')
        .select('id,full_name')
        .eq('is_active',true)
        .order('full_name'),
      supabase.from('v111_attendance')
        .select('employee_id,attendance_date,status')
        .gte('attendance_date',startDate),
      supabase.from('v111_employee_payroll_settings')
        .select('employee_id,attendance_rate,monthly_allowance'),
      supabase.from('v111_employee_revenue_shares')
        .select('employee_id,category,share_percent'),
      supabase.from('v111_payroll_adjustments')
        .select('employee_id,payroll_month,bonus')
        .gte('payroll_month',startDate),
      supabase.from('v100_services')
        .select('id,category'),
      supabase.from('v113_business_targets')
        .select('month_start,revenue_target,profit_target,order_target,note,updated_at')
        .eq('month_start',currentMonthStart)
        .maybeSingle()
    ])
    const error=p.error||e.error||o.error||i.error||emp.error||a.error||ps.error||shr.error||adj.error||sv.error||t.error
    if(error){
      setMessage(error.message.includes('v113_business_targets')
        ? 'Dashboard V113 belum siap. Jalankan SQL 034 di Supabase terlebih dahulu.'
        : error.message)
      return
    }
    setPayments((p.data as PaymentRow[])||[])
    setExpenses((e.data as ExpenseRow[])||[])
    setOrders((o.data as OrderRow[])||[])
    setItems((i.data as OrderItem[])||[])
    setEmployees((emp.data as Employee[])||[])
    setAttendance((a.data as Attendance[])||[])
    setPayrollSettings((ps.data as PayrollSetting[])||[])
    setPayrollShares((shr.data as PayrollShare[])||[])
    setPayrollAdjustments((adj.data as PayrollAdjustment[])||[])
    setServices((sv.data as Service[])||[])
    setTarget((t.data as TargetRow|null)||null)
  },[currentMonthStart])

  useEffect(()=>{void load()},[load])

  const orderMap=useMemo(()=>new Map(orders.map(row=>[row.id,row])),[orders])
  const settingMap=useMemo(()=>new Map(payrollSettings.map(row=>[row.employee_id,row])),[payrollSettings])
  const serviceCategory=useMemo(()=>new Map(services.map(service=>[
    service.id,(service.category||'Kiloan').trim()||'Kiloan'
  ])),[services])
  const itemsByOrder=useMemo(()=>{
    const map=new Map<string,OrderItem[]>()
    for(const item of items){
      const list=map.get(item.order_id)||[]
      list.push(item)
      map.set(item.order_id,list)
    }
    return map
  },[items])
  const sharesByEmployee=useMemo(()=>{
    const map=new Map<string,PayrollShare[]>()
    for(const share of payrollShares){
      const list=map.get(share.employee_id)||[]
      list.push(share)
      map.set(share.employee_id,list)
    }
    return map
  },[payrollShares])

  const payrollForMonth=useCallback((month:Date)=>{
    const monthPayments=payments.filter(row=>inMonth(row.created_at,month))
    const categoryRevenue:Record<string,number>={}

    for(const payment of monthPayments){
      const orderItems=itemsByOrder.get(payment.order_id)||[]
      const itemTotal=orderItems.reduce((sum,item)=>sum+Math.max(0,Number(item.subtotal||0)),0)
      const paymentAmount=Math.max(0,Number(payment.amount||0))
      if(paymentAmount<=0)continue
      if(orderItems.length===0||itemTotal<=0){
        categoryRevenue.Kiloan=(categoryRevenue.Kiloan||0)+paymentAmount
        continue
      }
      for(const item of orderItems){
        const subtotal=Math.max(0,Number(item.subtotal||0))
        if(subtotal<=0)continue
        const category=item.service_id?serviceCategory.get(item.service_id)||'Kiloan':'Kiloan'
        categoryRevenue[category]=(categoryRevenue[category]||0)+(paymentAmount*(subtotal/itemTotal))
      }
    }

    const adjustmentMap=new Map(
      payrollAdjustments
        .filter(row=>inMonth(`${row.payroll_month}T12:00:00`,month))
        .map(row=>[row.employee_id,row])
    )

    const rows:PayrollRow[]=employees.map(employee=>{
      const setting=settingMap.get(employee.id)
      const presentDays=attendance.filter(row=>
        row.employee_id===employee.id&&row.status==='present'&&inMonth(`${row.attendance_date}T12:00:00`,month)
      ).length
      const attendancePay=presentDays*Number(setting?.attendance_rate||0)
      const allowance=Number(setting?.monthly_allowance||0)
      const bonus=Number(adjustmentMap.get(employee.id)?.bonus||0)
      const revenueShare=(sharesByEmployee.get(employee.id)||[]).reduce((sum,share)=>
        sum+(Number(categoryRevenue[share.category]||0)*(Number(share.share_percent||0)/100)),0
      )
      return{
        employee,presentDays,attendancePay,allowance,bonus,revenueShare,
        total:attendancePay+allowance+bonus+revenueShare
      }
    })
    return{rows,total:rows.reduce((sum,row)=>sum+row.total,0)}
  },[payments,itemsByOrder,serviceCategory,payrollAdjustments,employees,settingMap,attendance,sharesByEmployee])

  const currentPayroll=useMemo(()=>payrollForMonth(currentMonth),[payrollForMonth])
  const previousPayroll=useMemo(()=>payrollForMonth(previousMonth),[payrollForMonth])

  const current=useMemo(()=>{
    const monthPayments=payments.filter(p=>inMonth(p.created_at,currentMonth))
    const monthExpenses=expenses.filter(e=>inMonth(`${e.expense_date}T12:00:00`,currentMonth))
    const monthOrders=orders.filter(o=>o.status!=='cancelled'&&inMonth(o.created_at,currentMonth))
    const revenue=monthPayments.reduce((s,p)=>s+Number(p.amount||0),0)
    const operationalExpense=monthExpenses.reduce((s,e)=>s+Number(e.amount||0),0)
    const payroll=currentPayroll.total
    const expense=operationalExpense+payroll
    const profit=revenue-expense
    return{payments:monthPayments,expenses:monthExpenses,orders:monthOrders,revenue,operationalExpense,payroll,expense,profit}
  },[payments,expenses,orders,currentPayroll])

  const previous=useMemo(()=>{
    const monthPayments=payments.filter(p=>inMonth(p.created_at,previousMonth))
    const monthExpenses=expenses.filter(e=>inMonth(`${e.expense_date}T12:00:00`,previousMonth))
    const monthOrders=orders.filter(o=>o.status!=='cancelled'&&inMonth(o.created_at,previousMonth))
    const revenue=monthPayments.reduce((s,p)=>s+Number(p.amount||0),0)
    const operationalExpense=monthExpenses.reduce((s,e)=>s+Number(e.amount||0),0)
    const expense=operationalExpense+previousPayroll.total
    return{revenue,expense,profit:revenue-expense,orders:monthOrders.length}
  },[payments,expenses,orders,previousPayroll])

  const receivableRows=useMemo(()=>orders.filter(o=>
    o.status!=='cancelled'&&Math.max(0,Number(o.total||0)-Number(o.paid_amount||0))>0
  ),[orders])
  const receivable=useMemo(()=>receivableRows
    .reduce((s,o)=>s+Math.max(0,Number(o.total||0)-Number(o.paid_amount||0)),0)
  ,[receivableRows])

  const targetValues={
    revenue:Number(target?.revenue_target||0),
    profit:Number(target?.profit_target||0),
    orders:Number(target?.order_target||0)
  }

  const revenueProgress=percent(current.revenue,targetValues.revenue)
  const profitProgress=percent(current.profit,targetValues.profit)
  const orderProgress=percent(current.orders.length,targetValues.orders)

  const daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate()
  const daysRemaining=Math.max(0,daysInMonth-now.getDate())
  const revenueNeed=Math.max(0,targetValues.revenue-current.revenue)
  const profitNeed=Math.max(0,targetValues.profit-current.profit)
  const dailyRevenueNeed=daysRemaining>0?revenueNeed/daysRemaining:revenueNeed
  const dailyProfitNeed=daysRemaining>0?profitNeed/daysRemaining:profitNeed

  const sixMonth=useMemo(()=>Array.from({length:6},(_,idx)=>{
    const d=new Date(now.getFullYear(),now.getMonth()-(5-idx),1)
    const revenue=payments.filter(p=>inMonth(p.created_at,d)).reduce((s,p)=>s+Number(p.amount||0),0)
    const operationalExpense=expenses.filter(e=>inMonth(`${e.expense_date}T12:00:00`,d)).reduce((s,e)=>s+Number(e.amount||0),0)
    const payroll=payrollForMonth(d).total
    const expense=operationalExpense+payroll
    return{label:d.toLocaleDateString('id-ID',{month:'short'}),revenue,expense,profit:revenue-expense}
  }),[payments,expenses,payrollForMonth])

  const chartMax=Math.max(1,...sixMonth.flatMap(x=>[x.revenue,Math.max(0,x.profit)]))

  const topServices=useMemo(()=>{
    const paymentByOrder=new Map<string,number>()
    for(const p of current.payments)paymentByOrder.set(p.order_id,(paymentByOrder.get(p.order_id)||0)+Number(p.amount||0))
    const grouped=new Map<string,number>()
    for(const [orderId,paid] of paymentByOrder){
      const list=itemsByOrder.get(orderId)||[]
      const subtotal=list.reduce((s,item)=>s+Math.max(0,Number(item.subtotal||0)),0)
      if(subtotal<=0)continue
      for(const item of list){
        const allocated=paid*(Math.max(0,Number(item.subtotal||0))/subtotal)
        grouped.set(item.service_name,(grouped.get(item.service_name)||0)+allocated)
      }
    }
    return Array.from(grouped.entries()).map(([name,revenue])=>({name,revenue})).sort((a,b)=>b.revenue-a.revenue).slice(0,5)
  },[current.payments,itemsByOrder])

  const topExpenseCategories=useMemo(()=>{
    const grouped=new Map<string,number>()
    for(const e of current.expenses)grouped.set(e.category_name,(grouped.get(e.category_name)||0)+Number(e.amount||0))
    if(current.payroll>0)grouped.set('Gaji Karyawan',(grouped.get('Gaji Karyawan')||0)+current.payroll)
    return Array.from(grouped.entries()).map(([name,amount])=>({name,amount})).sort((a,b)=>b.amount-a.amount).slice(0,5)
  },[current.expenses,current.payroll])

  const openTarget=()=>{
    setTargetDraft({
      revenue_target:String(target?.revenue_target||0),
      profit_target:String(target?.profit_target||0),
      order_target:String(target?.order_target||0),
      note:target?.note||''
    })
    setTargetOpen(true);setMessage('');setSuccess('')
  }

  const saveTarget=async(e:FormEvent)=>{
    e.preventDefault()
    if(!isOwner){setMessage('Hanya Owner yang dapat mengubah target bisnis.');return}
    const revenue=Math.max(0,Number(targetDraft.revenue_target||0))
    const profit=Math.max(0,Number(targetDraft.profit_target||0))
    const orderTarget=Math.max(0,Math.round(Number(targetDraft.order_target||0)))
    setBusy(true);setMessage('');setSuccess('')
    const {error}=await supabase.from('v113_business_targets').upsert({
      month_start:currentMonthStart,
      revenue_target:revenue,
      profit_target:profit,
      order_target:orderTarget,
      note:targetDraft.note.trim()||null,
      updated_at:new Date().toISOString()
    },{onConflict:'month_start'})
    if(error)setMessage(error.message)
    else{
      setSuccess(`Target ${monthLabel(currentMonth)} berhasil disimpan.`)
      setTargetOpen(false)
      await load()
    }
    setBusy(false)
  }

  if(!isOwner){
    return <section className="panel v113-owner-only">
      <AlertTriangle size={24}/>
      <div><b>Dashboard Laba & Target khusus Owner</b><span>Data laba, biaya dan target bisnis tidak ditampilkan kepada akun karyawan.</span></div>
    </section>
  }

  const revenueChange=changePercent(current.revenue,previous.revenue)
  const profitChange=changePercent(current.profit,previous.profit)

  const detailTitle=detailType==='revenue'?'Detail Omzet Masuk'
    :detailType==='expense'?'Detail Pengeluaran'
    :detailType==='profit'?'Detail Laba Bersih'
    :'Detail Piutang Aktif'

  return <>
    <PageHeader
      eyebrow="OWNER • V113"
      title="Dashboard Laba & Target Bisnis"
      description={`Pantau hasil usaha ${monthLabel(currentMonth)}, target bulanan, tren laba, pengeluaran, gaji dan piutang.`}
      action={<button className="primary-button" onClick={openTarget}><Pencil size={16}/>Atur Target Bulan Ini</button>}
    />

    {message&&<div className="error-box inline-message">{message}</div>}
    {success&&<div className="success-box inline-message"><Save size={17}/>{success}</div>}

    <section className="v113-kpi-grid">
      <article className="panel v113-kpi v113-clickable-kpi" role="button" tabIndex={0} onClick={()=>setDetailType('revenue')} onKeyDown={e=>{if(e.key==='Enter')setDetailType('revenue')}}>
        <div className="v113-kpi-icon revenue"><TrendingUp size={22}/></div>
        <div><span>Omzet Masuk Bulan Ini</span><strong>{formatRupiah(current.revenue)}</strong>
          <small className={revenueChange>=0?'positive':'negative'}>{revenueChange>=0?'▲':'▼'} {Math.abs(revenueChange).toFixed(1)}% vs bulan lalu</small>
        </div><Eye className="v113-kpi-eye" size={16}/>
      </article>
      <article className="panel v113-kpi v113-clickable-kpi" role="button" tabIndex={0} onClick={()=>setDetailType('expense')} onKeyDown={e=>{if(e.key==='Enter')setDetailType('expense')}}>
        <div className="v113-kpi-icon expense"><TrendingDown size={22}/></div>
        <div><span>Pengeluaran + Gaji</span><strong>{formatRupiah(current.expense)}</strong><small>Operasional {formatRupiah(current.operationalExpense)} • Gaji {formatRupiah(current.payroll)}</small></div>
        <Eye className="v113-kpi-eye" size={16}/>
      </article>
      <article className="panel v113-kpi featured v113-clickable-kpi" role="button" tabIndex={0} onClick={()=>setDetailType('profit')} onKeyDown={e=>{if(e.key==='Enter')setDetailType('profit')}}>
        <div className="v113-kpi-icon profit"><CircleDollarSign size={22}/></div>
        <div><span>Laba Bersih Operasional</span><strong>{formatRupiah(current.profit)}</strong>
          <small className={profitChange>=0?'positive':'negative'}>{profitChange>=0?'▲':'▼'} {Math.abs(profitChange).toFixed(1)}% vs bulan lalu</small>
        </div><Eye className="v113-kpi-eye" size={16}/>
      </article>
      <article className="panel v113-kpi v113-clickable-kpi" role="button" tabIndex={0} onClick={()=>setDetailType('receivable')} onKeyDown={e=>{if(e.key==='Enter')setDetailType('receivable')}}>
        <div className="v113-kpi-icon receivable"><WalletCards size={22}/></div>
        <div><span>Piutang Aktif</span><strong>{formatRupiah(receivable)}</strong><small>{receivableRows.length} order belum lunas</small></div>
        <Eye className="v113-kpi-eye" size={16}/>
      </article>
    </section>

    <section className="v113-target-grid">
      <article className="panel v113-target-card">
        <header><div><Target size={20}/><span><b>Target Omzet</b><small>{monthLabel(currentMonth)}</small></span></div><strong>{revenueProgress.toFixed(0)}%</strong></header>
        <div className="v113-progress"><i style={{width:`${capPercent(revenueProgress)}%`}}/></div>
        <div className="v113-target-values"><b>{formatRupiah(current.revenue)}</b><span>dari {formatRupiah(targetValues.revenue)}</span></div>
        <footer>{targetValues.revenue>0
          ? revenueNeed>0?<><Crosshair size={15}/>Kurang {formatRupiah(revenueNeed)} • perlu sekitar {formatRupiah(dailyRevenueNeed)}/hari</>:<><Save size={15}/>Target omzet tercapai</>
          :'Target omzet belum diatur'}</footer>
      </article>

      <article className="panel v113-target-card">
        <header><div><Landmark size={20}/><span><b>Target Laba</b><small>Omzet − operasional − gaji</small></span></div><strong>{profitProgress.toFixed(0)}%</strong></header>
        <div className="v113-progress profit"><i style={{width:`${capPercent(profitProgress)}%`}}/></div>
        <div className="v113-target-values"><b>{formatRupiah(current.profit)}</b><span>dari {formatRupiah(targetValues.profit)}</span></div>
        <footer>{targetValues.profit>0
          ? profitNeed>0?<><Crosshair size={15}/>Kurang {formatRupiah(profitNeed)} • perlu sekitar {formatRupiah(dailyProfitNeed)}/hari</>:<><Save size={15}/>Target laba tercapai</>
          :'Target laba belum diatur'}</footer>
      </article>

      <article className="panel v113-target-card">
        <header><div><ReceiptText size={20}/><span><b>Target Order</b><small>Order non-batal bulan ini</small></span></div><strong>{orderProgress.toFixed(0)}%</strong></header>
        <div className="v113-progress orders"><i style={{width:`${capPercent(orderProgress)}%`}}/></div>
        <div className="v113-target-values"><b>{current.orders.length} order</b><span>dari {targetValues.orders} order</span></div>
        <footer><CalendarDays size={15}/>{daysRemaining} hari tersisa di bulan ini</footer>
      </article>
    </section>

    <section className="v113-main-grid">
      <article className="panel v113-trend-panel">
        <header className="v113-section-head"><div><b>Tren 6 Bulan</b><small>Omzet masuk dan laba setelah pengeluaran + gaji</small></div></header>
        <div className="v113-month-chart">
          {sixMonth.map(row=><div className="v113-month-column" key={row.label}>
            <div className="v113-bar-area">
              <i className="revenue" title={`Omzet ${formatRupiah(row.revenue)}`} style={{height:`${Math.max(2,(row.revenue/chartMax)*100)}%`}}/>
              <i className="profit" title={`Laba ${formatRupiah(row.profit)}`} style={{height:`${Math.max(2,(Math.max(0,row.profit)/chartMax)*100)}%`}}/>
            </div>
            <b>{row.label}</b><small>{formatRupiah(row.profit)}</small>
          </div>)}
        </div>
        <div className="v113-chart-legend"><span><i className="revenue"/>Omzet</span><span><i className="profit"/>Laba</span></div>
      </article>

      <article className="panel v113-health-panel">
        <header className="v113-section-head"><div><b>Kesehatan Bisnis Bulan Ini</b><small>Ringkasan angka yang perlu diperhatikan Owner</small></div></header>
        <div className="v113-health-list">
          <div><span>Margin laba</span><b>{current.revenue>0?((current.profit/current.revenue)*100).toFixed(1):'0.0'}%</b></div>
          <div><span>Pengeluaran operasional</span><b>{formatRupiah(current.operationalExpense)}</b></div>
          <div><span>Gaji karyawan otomatis</span><b>{formatRupiah(current.payroll)}</b></div>
          <div><span>Rata-rata omzet / hari berjalan</span><b>{formatRupiah(current.revenue/Math.max(1,now.getDate()))}</b></div>
          <div><span>Order bulan ini</span><b>{current.orders.length}</b></div>
          <div><span>Piutang aktif</span><b>{formatRupiah(receivable)}</b></div>
        </div>
      </article>
    </section>

    <section className="v113-main-grid">
      <article className="panel">
        <header className="v113-section-head"><div><b>Top 5 Layanan Penyumbang Omzet</b><small>Berdasarkan pembayaran yang benar-benar masuk bulan ini</small></div></header>
        <div className="v113-ranking-list">
          {topServices.length===0&&<div className="mini-empty">Belum ada pembayaran bulan ini.</div>}
          {topServices.map((row,index)=><div key={row.name}><span className="v113-rank">{index+1}</span><b>{row.name}</b><strong>{formatRupiah(row.revenue)}</strong></div>)}
        </div>
      </article>
      <article className="panel">
        <header className="v113-section-head"><div><b>Top 5 Pengeluaran</b><small>Termasuk gaji karyawan otomatis</small></div></header>
        <div className="v113-ranking-list expense-list">
          {topExpenseCategories.length===0&&<div className="mini-empty">Belum ada pengeluaran bulan ini.</div>}
          {topExpenseCategories.map((row,index)=><div key={row.name}><span className="v113-rank">{index+1}</span><b>{row.name}</b><strong>{formatRupiah(row.amount)}</strong></div>)}
        </div>
      </article>
    </section>

    {detailType&&<Modal title={detailTitle} onClose={()=>setDetailType(null)}>
      <div className="v113-detail-modal">
        {detailType==='revenue'&&<>
          <div className="v113-detail-summary"><span>Omzet masuk {monthLabel(currentMonth)}</span><b>{formatRupiah(current.revenue)}</b><small>{current.payments.length} pembayaran</small></div>
          <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Order</th><th>Pelanggan</th><th>Metode</th><th>Masuk</th></tr></thead><tbody>
            {current.payments.length===0&&<tr><td colSpan={5} className="table-empty">Belum ada pembayaran.</td></tr>}
            {[...current.payments].reverse().map(row=>{const order=orderMap.get(row.order_id);return <tr key={row.id}><td>{new Date(row.created_at).toLocaleDateString('id-ID')}</td><td><b>{order?.order_no||'-'}</b></td><td>{order?.customer_name||'-'}</td><td>{(row.method||'-').toUpperCase()}</td><td><b>{formatRupiah(Number(row.amount))}</b></td></tr>})}
          </tbody></table></div>
        </>}

        {detailType==='expense'&&<>
          <div className="v113-profit-equation expense"><div><span>Pengeluaran Operasional</span><b>{formatRupiah(current.operationalExpense)}</b></div><div><span>Gaji Karyawan</span><b>{formatRupiah(current.payroll)}</b></div><strong>Total Pengeluaran {formatRupiah(current.expense)}</strong></div>
          <h4>Rincian Gaji Otomatis</h4>
          <div className="table-wrap"><table><thead><tr><th>Karyawan</th><th>Hadir</th><th>Uang Hadir</th><th>Tunjangan</th><th>Bonus</th><th>Bagi Hasil</th><th>Total</th></tr></thead><tbody>
            {currentPayroll.rows.map(row=><tr key={row.employee.id}><td><b>{row.employee.full_name}</b></td><td>{row.presentDays}</td><td>{formatRupiah(row.attendancePay)}</td><td>{formatRupiah(row.allowance)}</td><td>{formatRupiah(row.bonus)}</td><td>{formatRupiah(row.revenueShare)}</td><td><b>{formatRupiah(row.total)}</b></td></tr>)}
          </tbody></table></div>
          <h4>Pengeluaran Operasional</h4>
          <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Kategori</th><th>Keterangan</th><th>Nominal</th></tr></thead><tbody>
            {current.expenses.length===0&&<tr><td colSpan={4} className="table-empty">Belum ada pengeluaran operasional.</td></tr>}
            {[...current.expenses].reverse().map(row=><tr key={row.id}><td>{new Date(`${row.expense_date}T12:00:00`).toLocaleDateString('id-ID')}</td><td><b>{row.category_name}</b></td><td>{row.description||'-'}</td><td><b>{formatRupiah(Number(row.amount))}</b></td></tr>)}
          </tbody></table></div>
        </>}

        {detailType==='profit'&&<>
          <div className="v113-profit-detail-hero"><CircleDollarSign size={30}/><span>Laba Bersih {monthLabel(currentMonth)}</span><strong>{formatRupiah(current.profit)}</strong></div>
          <div className="v113-profit-equation"><div><span>Omzet Masuk</span><b>+ {formatRupiah(current.revenue)}</b></div><div><span>Pengeluaran Operasional</span><b>− {formatRupiah(current.operationalExpense)}</b></div><div><span>Gaji Karyawan</span><b>− {formatRupiah(current.payroll)}</b></div><strong>= {formatRupiah(current.profit)}</strong></div>
          <p className="v113-detail-note">Gaji dihitung otomatis dengan rumus yang sama seperti menu Absensi & Gaji: uang hadir + tunjangan + bonus + bagi hasil kategori layanan.</p>
        </>}

        {detailType==='receivable'&&<>
          <div className="v113-detail-summary"><span>Total Piutang Aktif</span><b>{formatRupiah(receivable)}</b><small>{receivableRows.length} order</small></div>
          <div className="table-wrap"><table><thead><tr><th>Order</th><th>Pelanggan</th><th>Total</th><th>Sudah Bayar</th><th>Sisa</th></tr></thead><tbody>
            {receivableRows.map(row=><tr key={row.id}><td><b>{row.order_no}</b></td><td>{row.customer_name}</td><td>{formatRupiah(Number(row.total))}</td><td>{formatRupiah(Number(row.paid_amount))}</td><td><b>{formatRupiah(Math.max(0,Number(row.total)-Number(row.paid_amount)))}</b></td></tr>)}
          </tbody></table></div>
        </>}
      </div>
    </Modal>}

    {targetOpen&&<Modal title={`Target ${monthLabel(currentMonth)}`} onClose={()=>setTargetOpen(false)}>
      <form className="modal-form" onSubmit={saveTarget}>
        <label>Target Omzet Bulanan<input type="number" min="0" value={targetDraft.revenue_target} onChange={e=>setTargetDraft({...targetDraft,revenue_target:e.target.value})}/></label>
        <label>Target Laba Bulanan<input type="number" min="0" value={targetDraft.profit_target} onChange={e=>setTargetDraft({...targetDraft,profit_target:e.target.value})}/></label>
        <label>Target Jumlah Order<input type="number" min="0" step="1" value={targetDraft.order_target} onChange={e=>setTargetDraft({...targetDraft,order_target:e.target.value})}/></label>
        <label>Catatan Target<textarea rows={3} value={targetDraft.note} onChange={e=>setTargetDraft({...targetDraft,note:e.target.value})} placeholder="Contoh: target promo Agustus"/></label>
        <div className="v113-target-explanation">Laba = <b>pembayaran masuk − pengeluaran operasional − gaji karyawan</b>. Piutang belum dihitung sebagai omzet.</div>
        {message&&<div className="error-box">{message}</div>}
        <div className="form-actions"><button type="button" className="secondary-button" onClick={()=>setTargetOpen(false)}>Batal</button><button className="primary-button" disabled={busy}><Save size={16}/>{busy?'Menyimpan...':'Simpan Target'}</button></div>
      </form>
    </Modal>}
  </>
}
