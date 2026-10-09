import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays, FileSpreadsheet, FileText, PiggyBank, ReceiptText, Settings2,
  TrendingDown, TrendingUp, Users, WalletCards
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { Modal } from '../components/Modal'
import { downloadFinancialStatementXls, printFinancialStatementPdf } from '../lib/exportData'
import { formatRupiah } from '../lib/format'
import { supabase } from '../lib/supabase'
import {
  addBusinessDays, businessDateKey, businessDateTimeIso, businessMonthStartKey
} from '../lib/businessTime'

interface OrderRow{
  id:string
  order_no:string
  total:number
  paid_amount:number
  status:string
  created_at:string
}
interface PaymentRow{
  id:string
  order_id:string
  amount:number
  created_at:string
}
interface ExpenseRow{
  id:string
  expense_date:string
  category_name:string
  group_name:string|null
  amount:number
  description:string|null
  reference:string|null
}
interface AttendanceRow{
  employee_id:string
  attendance_date:string
  status:string
}
interface PayrollSetting{
  employee_id:string
  attendance_rate:number
  monthly_allowance:number
}
interface PayrollAdjustment{
  employee_id:string
  payroll_month:string
  bonus:number
}
interface EmployeeShare{
  employee_id:string
  category:string
  share_percent:number
}
interface CommissionRow{
  employee_id:string
  commission_type:'production'|'courier'
  amount:number
  earned_at:string
}
interface OrderItem{
  order_id:string
  service_id:string|null
  subtotal:number
}
interface ServiceRow{
  id:string
  category:string|null
}
interface EmployeeRow{
  id:string
  full_name:string
}
interface ReserveSetting{
  reserve_type:'depreciation'|'thr'|'health'|'unexpected'
  label:string
  method:'fixed'|'percent_revenue'
  monthly_amount:number
  revenue_percent:number
  is_active:boolean
  note:string|null
}
type PeriodPreset='today'|'7d'|'month'|'last_month'|'custom'
type DetailKey='revenue'|'cash'|'receivable'|'cash_surplus'|'operating'|'attendance'|'allowance'|'bonus'|'share'|'production'|'courier'|'payroll'|'operating_net'|'reserves'|'net_after_reserve'|null

const pad=(n:number)=>String(n).padStart(2,'0')
const daysInMonth=(year:number,month:number)=>new Date(Date.UTC(year,month,0)).getUTCDate()

function previousMonthRange(){
  const today=businessDateKey()
  const [y,m]=today.split('-').map(Number)
  const d=new Date(Date.UTC(y,m-2,1,12))
  const year=d.getUTCFullYear()
  const month=d.getUTCMonth()+1
  return{
    from:`${year}-${pad(month)}-01`,
    to:`${year}-${pad(month)}-${pad(daysInMonth(year,month))}`
  }
}

function rangeDaysByMonth(from:string,to:string){
  const start=new Date(`${from}T12:00:00+07:00`)
  const end=new Date(`${to}T12:00:00+07:00`)
  const map=new Map<string,number>()
  for(let cursor=new Date(start);cursor<=end;cursor.setUTCDate(cursor.getUTCDate()+1)){
    const key=`${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth()+1)}`
    map.set(key,(map.get(key)||0)+1)
  }
  return map
}

function isPayrollLikeExpense(row:ExpenseRow){
  const key=`${row.category_name||''} ${row.group_name||''}`.toLowerCase()
  return /(gaji|payroll|komisi|tunjangan|bonus|bagi hasil|sdm)/.test(key)
}

export function ProfitLossPage(){
  const today=businessDateKey()
  const [preset,setPreset]=useState<PeriodPreset>('month')
  const [from,setFrom]=useState(businessMonthStartKey())
  const [to,setTo]=useState(today)
  const [appliedFrom,setAppliedFrom]=useState(businessMonthStartKey())
  const [appliedTo,setAppliedTo]=useState(today)

  const [orders,setOrders]=useState<OrderRow[]>([])
  const [payments,setPayments]=useState<PaymentRow[]>([])
  const [expenses,setExpenses]=useState<ExpenseRow[]>([])
  const [attendance,setAttendance]=useState<AttendanceRow[]>([])
  const [settings,setSettings]=useState<PayrollSetting[]>([])
  const [adjustments,setAdjustments]=useState<PayrollAdjustment[]>([])
  const [shares,setShares]=useState<EmployeeShare[]>([])
  const [commissions,setCommissions]=useState<CommissionRow[]>([])
  const [items,setItems]=useState<OrderItem[]>([])
  const [services,setServices]=useState<ServiceRow[]>([])
  const [employees,setEmployees]=useState<EmployeeRow[]>([])
  const [reserveSettings,setReserveSettings]=useState<ReserveSetting[]>([])
  const [reserveDraft,setReserveDraft]=useState<ReserveSetting[]>([])
  const [reserveModal,setReserveModal]=useState(false)
  const [savingReserve,setSavingReserve]=useState(false)
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const [detail,setDetail]=useState<DetailKey>(null)

  const load=useCallback(async()=>{
    setLoading(true)
    setMessage('')
    const fromISO=businessDateTimeIso(appliedFrom)
    const toISO=businessDateTimeIso(appliedTo,'23:59:59.999')

    const firstMonth=`${appliedFrom.slice(0,7)}-01`
    const lastMonth=`${appliedTo.slice(0,7)}-01`

    const [o,p,e,a,ps,adj,shr,com,it,sv,emp,res]=await Promise.all([
      supabase.from('v100_orders_view')
        .select('id,order_no,total,paid_amount,status,created_at')
        .gte('created_at',fromISO).lte('created_at',toISO),
      supabase.from('v100_payments')
        .select('id,order_id,amount,created_at')
        .gte('created_at',fromISO).lte('created_at',toISO),
      supabase.from('v106_expenses_view')
        .select('id,expense_date,category_name,group_name,amount,description,reference')
        .gte('expense_date',appliedFrom).lte('expense_date',appliedTo)
        .order('expense_date',{ascending:false}),
      supabase.from('v111_attendance')
        .select('employee_id,attendance_date,status')
        .gte('attendance_date',appliedFrom).lte('attendance_date',appliedTo),
      supabase.from('v111_employee_payroll_settings')
        .select('employee_id,attendance_rate,monthly_allowance'),
      supabase.from('v111_payroll_adjustments')
        .select('employee_id,payroll_month,bonus')
        .gte('payroll_month',firstMonth).lte('payroll_month',lastMonth),
      supabase.from('v111_employee_revenue_shares')
        .select('employee_id,category,share_percent'),
      supabase.from('v113_commission_ledger')
        .select('employee_id,commission_type,amount,earned_at')
        .gte('earned_at',fromISO).lte('earned_at',toISO),
      supabase.from('v100_order_items')
        .select('order_id,service_id,subtotal'),
      supabase.from('v100_services')
        .select('id,category'),
      supabase.from('v109_users')
        .select('id,full_name')
        .eq('is_active',true)
        .order('full_name'),
      supabase.from('v113095_reserve_settings')
        .select('reserve_type,label,method,monthly_amount,revenue_percent,is_active,note')
        .order('reserve_type')
    ])

    const error=o.error||p.error||e.error||a.error||ps.error||adj.error||shr.error||com.error||it.error||sv.error||emp.error||res.error
    if(error){
      setMessage(error.message)
    }else{
      setOrders((o.data as OrderRow[])||[])
      setPayments((p.data as PaymentRow[])||[])
      setExpenses((e.data as ExpenseRow[])||[])
      setAttendance((a.data as AttendanceRow[])||[])
      setSettings((ps.data as PayrollSetting[])||[])
      setAdjustments((adj.data as PayrollAdjustment[])||[])
      setShares((shr.data as EmployeeShare[])||[])
      setCommissions((com.data as CommissionRow[])||[])
      setItems((it.data as OrderItem[])||[])
      setServices((sv.data as ServiceRow[])||[])
      setEmployees((emp.data as EmployeeRow[])||[])
      setReserveSettings((res.data as ReserveSetting[])||[])
    }
    setLoading(false)
  },[appliedFrom,appliedTo])

  useEffect(()=>{void load()},[load])

  const report=useMemo(()=>{
    const validOrders=orders.filter(row=>row.status!=='cancelled')
    const revenue=validOrders.reduce((sum,row)=>sum+Math.max(0,Number(row.total||0)),0)
    const cashIn=payments.reduce((sum,row)=>sum+Number(row.amount||0),0)
    const receivable=validOrders.reduce((sum,row)=>sum+Math.max(0,Number(row.total||0)-Number(row.paid_amount||0)),0)

    const operatingRows=expenses.filter(row=>!isPayrollLikeExpense(row))
    const excludedPayrollLike=expenses.filter(row=>isPayrollLikeExpense(row))
    const operating=operatingRows.reduce((sum,row)=>sum+Number(row.amount||0),0)

    const employeeMap=new Map(employees.map(row=>[row.id,row.full_name]))
    const settingMap=new Map(settings.map(row=>[row.employee_id,row]))

    const attendanceByEmployee=new Map<string,number>()
    for(const row of attendance){
      if(row.status!=='present')continue
      attendanceByEmployee.set(row.employee_id,(attendanceByEmployee.get(row.employee_id)||0)+1)
    }

    const attendanceDetail=Array.from(attendanceByEmployee.entries()).map(([employeeId,days])=>{
      const rate=Number(settingMap.get(employeeId)?.attendance_rate||0)
      return{employeeId,name:employeeMap.get(employeeId)||'Karyawan',days,rate,amount:days*rate}
    }).filter(row=>row.amount>0)
    const attendancePay=attendanceDetail.reduce((sum,row)=>sum+row.amount,0)

    const monthDays=rangeDaysByMonth(appliedFrom,appliedTo)
    const allowanceDetail: Array<{employeeId:string;name:string;month:string;days:number;monthDays:number;monthly:number;amount:number}>=[]
    const bonusDetail: Array<{employeeId:string;name:string;month:string;days:number;monthDays:number;monthly:number;amount:number}>=[]

    for(const [monthKey,selectedDays] of monthDays.entries()){
      const [year,month]=monthKey.split('-').map(Number)
      const totalDays=daysInMonth(year,month)
      for(const setting of settings){
        const monthly=Number(setting.monthly_allowance||0)
        if(monthly<=0)continue
        allowanceDetail.push({
          employeeId:setting.employee_id,
          name:employeeMap.get(setting.employee_id)||'Karyawan',
          month:monthKey,days:selectedDays,monthDays:totalDays,monthly,
          amount:monthly*(selectedDays/totalDays)
        })
      }
      for(const row of adjustments.filter(x=>x.payroll_month.startsWith(monthKey))){
        const monthly=Number(row.bonus||0)
        if(monthly<=0)continue
        bonusDetail.push({
          employeeId:row.employee_id,
          name:employeeMap.get(row.employee_id)||'Karyawan',
          month:monthKey,days:selectedDays,monthDays:totalDays,monthly,
          amount:monthly*(selectedDays/totalDays)
        })
      }
    }

    const allowance=allowanceDetail.reduce((sum,row)=>sum+row.amount,0)
    const bonus=bonusDetail.reduce((sum,row)=>sum+row.amount,0)

    const serviceCategory=new Map(services.map(row=>[row.id,(row.category||'Kiloan').trim()||'Kiloan']))
    const itemsByOrder=new Map<string,OrderItem[]>()
    for(const item of items){
      const list=itemsByOrder.get(item.order_id)||[]
      list.push(item)
      itemsByOrder.set(item.order_id,list)
    }

    const categoryRevenue:Record<string,number>={}
    for(const order of validOrders){
      const orderTotal=Math.max(0,Number(order.total||0))
      if(orderTotal<=0)continue
      const list=itemsByOrder.get(order.id)||[]
      const itemTotal=list.reduce((sum,item)=>sum+Math.max(0,Number(item.subtotal||0)),0)
      if(list.length===0||itemTotal<=0){
        categoryRevenue.Kiloan=(categoryRevenue.Kiloan||0)+orderTotal
        continue
      }
      for(const item of list){
        const subtotal=Math.max(0,Number(item.subtotal||0))
        if(subtotal<=0)continue
        const category=item.service_id?serviceCategory.get(item.service_id)||'Kiloan':'Kiloan'
        categoryRevenue[category]=(categoryRevenue[category]||0)+orderTotal*(subtotal/itemTotal)
      }
    }

    const shareDetail=shares.map(row=>{
      const base=Number(categoryRevenue[row.category]||0)
      const percent=Number(row.share_percent||0)
      return{
        employeeId:row.employee_id,
        name:employeeMap.get(row.employee_id)||'Karyawan',
        category:row.category,
        base,percent,
        amount:base*(percent/100)
      }
    }).filter(row=>row.amount>0)
    const revenueShare=shareDetail.reduce((sum,row)=>sum+row.amount,0)

    const productionDetail=commissions.filter(row=>row.commission_type==='production')
    const courierDetail=commissions.filter(row=>row.commission_type==='courier')
    const productionCommission=productionDetail.reduce((sum,row)=>sum+Number(row.amount||0),0)
    const courierCommission=courierDetail.reduce((sum,row)=>sum+Number(row.amount||0),0)

    const payroll=attendancePay+allowance+bonus+revenueShare+productionCommission+courierCommission
    const totalCost=operating+payroll
    const operatingNet=revenue-totalCost
    const operatingMargin=revenue>0?(operatingNet/revenue)*100:0
    const cashOperatingSurplus=cashIn-totalCost

    const monthDaysForReserve=rangeDaysByMonth(appliedFrom,appliedTo)
    const reserveDetail=reserveSettings.filter(row=>row.is_active).map(row=>{
      let amount=0
      if(row.method==='percent_revenue'){
        amount=revenue*(Number(row.revenue_percent||0)/100)
      }else{
        for(const [monthKey,selectedDays] of monthDaysForReserve.entries()){
          const [year,month]=monthKey.split('-').map(Number)
          amount+=Number(row.monthly_amount||0)*(selectedDays/daysInMonth(year,month))
        }
      }
      return{...row,amount}
    })
    const reserveTotal=reserveDetail.reduce((sum,row)=>sum+row.amount,0)
    const netAfterReserve=operatingNet-reserveTotal
    const marginAfterReserve=revenue>0?(netAfterReserve/revenue)*100:0

    const operatingByCategory=Object.entries(operatingRows.reduce<Record<string,number>>((map,row)=>{
      const key=row.category_name||'Lain-lain'
      map[key]=(map[key]||0)+Number(row.amount||0)
      return map
    },{})).sort((a,b)=>b[1]-a[1])

    return{
      validOrders,revenue,cashIn,receivable,operatingRows,excludedPayrollLike,operating,
      attendanceDetail,attendancePay,allowanceDetail,allowance,bonusDetail,bonus,
      shareDetail,revenueShare,productionDetail,courierDetail,productionCommission,courierCommission,
      payroll,totalCost,operatingNet,operatingMargin,cashOperatingSurplus,
      reserveDetail,reserveTotal,netAfterReserve,marginAfterReserve,
      operatingByCategory,employeeMap
    }
  },[orders,payments,expenses,attendance,settings,adjustments,shares,commissions,items,services,employees,reserveSettings,appliedFrom,appliedTo])

  const setQuick=(next:Exclude<PeriodPreset,'custom'>)=>{
    const current=businessDateKey()
    let a=current,b=current
    if(next==='7d')a=addBusinessDays(current,-6)
    if(next==='month')a=businessMonthStartKey()
    if(next==='last_month'){
      const prev=previousMonthRange()
      a=prev.from;b=prev.to
    }
    setPreset(next);setFrom(a);setTo(b);setAppliedFrom(a);setAppliedTo(b)
  }

  const applyCustom=()=>{
    if(!from||!to||from>to){setMessage('Periode tidak valid.');return}
    setPreset('custom');setAppliedFrom(from);setAppliedTo(to)
  }

  const openReserveSettings=()=>{
    setReserveDraft(reserveSettings.map(row=>({...row})))
    setReserveModal(true)
  }

  const updateReserveDraft=(type:ReserveSetting['reserve_type'],patch:Partial<ReserveSetting>)=>{
    setReserveDraft(rows=>rows.map(row=>row.reserve_type===type?{...row,...patch}:row))
  }

  const saveReserveSettings=async()=>{
    setSavingReserve(true)
    setMessage('')
    const payload=reserveDraft.map(row=>({
      reserve_type:row.reserve_type,
      label:row.label,
      method:row.method,
      monthly_amount:Math.max(0,Number(row.monthly_amount||0)),
      revenue_percent:Math.max(0,Number(row.revenue_percent||0)),
      is_active:Boolean(row.is_active),
      note:row.note||null,
      updated_at:new Date().toISOString()
    }))
    const {error}=await supabase.from('v113095_reserve_settings').upsert(payload,{onConflict:'reserve_type'})
    if(error){
      setMessage(error.message)
    }else{
      setReserveSettings(payload as ReserveSetting[])
      setReserveModal(false)
    }
    setSavingReserve(false)
  }

  const exportOptions=()=>({
    title:'Laporan Laba Rugi',
    filename:`laba-rugi-${appliedFrom}-${appliedTo}`,
    subtitle:`Periode ${appliedFrom} s/d ${appliedTo}`,
    businessName:'HappyLaundry Babakan',
    summary:[
      ['Pendapatan / Omzet',Math.round(report.revenue)],
      ['Biaya Operasional',Math.round(report.operating)],
      ['Biaya Karyawan',Math.round(report.payroll)],
      ['Laba Bersih Operasional',Math.round(report.operatingNet)],
      ['Total Cadangan',Math.round(report.reserveTotal)],
      ['Laba Bersih Setelah Cadangan',Math.round(report.netAfterReserve)],
      ['Surplus Kas Operasional',Math.round(report.cashOperatingSurplus)]
    ] as Array<[string,string|number]>,
    sections:[
      {
        title:'A. Pendapatan',
        rows:[
          ['Omzet / Nilai Order Masuk',Math.round(report.revenue)]
        ] as Array<[string,string|number]>
      },
      {
        title:'B. Biaya Operasional',
        rows:report.operatingByCategory.map(([name,value])=>[name,Math.round(value)] as [string,number]),
        total:['Subtotal Biaya Operasional',Math.round(report.operating)] as [string,number]
      },
      {
        title:'C. Biaya Karyawan',
        rows:[
          ['Uang Hadir',Math.round(report.attendancePay)],
          ['Tunjangan',Math.round(report.allowance)],
          ['Bonus',Math.round(report.bonus)],
          ['Bagi Hasil',Math.round(report.revenueShare)],
          ['Komisi Produksi',Math.round(report.productionCommission)],
          ['Komisi Kurir',Math.round(report.courierCommission)]
        ] as Array<[string,string|number]>,
        total:['Subtotal Biaya Karyawan',Math.round(report.payroll)] as [string,number]
      },
      {
        title:'D. Cadangan & Kewajiban',
        rows:report.reserveDetail.map(row=>[row.label,Math.round(row.amount)] as [string,number]),
        total:['Subtotal Cadangan',Math.round(report.reserveTotal)] as [string,number]
      }
,
      {
        title:'E. Posisi Kas & Piutang',
        rows:[
          ['Kas Masuk',Math.round(report.cashIn)],
          ['Piutang Belum Tertagih',Math.round(report.receivable)],
          ['Surplus Kas Operasional',Math.round(report.cashOperatingSurplus)]
        ] as Array<[string,string|number]>
      }
    ],
    resultRows:[
      ['Total Biaya Operasional + Karyawan',Math.round(report.totalCost)],
      ['Laba Bersih Operasional',Math.round(report.operatingNet)],
      ['Margin Operasional',`${report.operatingMargin.toFixed(2)}%`],
      ['Total Cadangan',Math.round(report.reserveTotal)],
      ['Laba Bersih Setelah Cadangan',Math.round(report.netAfterReserve)],
      ['Surplus Kas Operasional',Math.round(report.cashOperatingSurplus)]
    ] as Array<[string,string|number]>,
    notes:[
      'Piutang tidak mengurangi laba. Dasar pendapatan laba rugi adalah nilai order masuk pada periode terpilih.',
      'Surplus Kas Operasional = Kas Masuk - Biaya Operasional - Biaya Karyawan. Angka ini menunjukkan posisi kas operasional periode, bukan laba akuntansi.',
      'Cadangan dipisahkan dari biaya operasional agar Laba Bersih Operasional dan Laba Setelah Cadangan mudah dibandingkan.'
    ]
  })

  const detailTitle={
    revenue:'Detail Pendapatan / Order Masuk',
    cash:'Detail Kas Masuk',
    receivable:'Detail Piutang',
    cash_surplus:'Perhitungan Surplus Kas Operasional',
    operating:'Detail Pengeluaran Operasional',
    attendance:'Detail Uang Hadir',
    allowance:'Detail Tunjangan',
    bonus:'Detail Bonus',
    share:'Detail Bagi Hasil',
    production:'Detail Komisi Produksi',
    courier:'Detail Komisi Kurir',
    payroll:'Detail Biaya Karyawan',
    operating_net:'Perhitungan Laba Bersih Operasional',
    reserves:'Detail Cadangan & Kewajiban',
    net_after_reserve:'Perhitungan Laba Setelah Cadangan'
  }[detail||'revenue']

  const detailContent=()=>{
    if(detail==='revenue')return <div className="pl-detail-list">
      {report.validOrders.map(row=><div key={row.id}><span>{row.order_no}</span><b>{formatRupiah(row.total)}</b></div>)}
    </div>

    if(detail==='cash')return <div className="pl-detail-list">
      {payments.map(row=><div key={row.id}><span>{new Date(row.created_at).toLocaleDateString('id-ID')}</span><b>{formatRupiah(row.amount)}</b></div>)}
    </div>

    if(detail==='receivable')return <div className="pl-detail-list">
      {report.validOrders.filter(row=>Number(row.total)-Number(row.paid_amount)>0).map(row=><div key={row.id}>
        <span>{row.order_no}</span><b>{formatRupiah(Math.max(0,Number(row.total)-Number(row.paid_amount)))}</b>
      </div>)}
    </div>

    if(detail==='cash_surplus')return <div className="pl-detail-list pl-calc-list">
      <div><span>Kas Masuk</span><b>{formatRupiah(report.cashIn)}</b></div>
      <div><span>Biaya Operasional</span><b>- {formatRupiah(report.operating)}</b></div>
      <div><span>Biaya Karyawan</span><b>- {formatRupiah(report.payroll)}</b></div>
      <div className="is-total"><span>Surplus Kas Operasional</span><b>{formatRupiah(report.cashOperatingSurplus)}</b></div>
      <p className="pl-detail-note">Surplus kas menunjukkan uang yang benar-benar masuk pada periode setelah dikurangi biaya periode. Piutang tidak dikurangkan lagi dari laba.</p>
    </div>

    if(detail==='operating')return <div className="pl-detail-list">
      {report.operatingRows.map(row=><div key={row.id}>
        <span>{row.expense_date} • {row.category_name}{row.description?` • ${row.description}`:''}</span>
        <b>{formatRupiah(row.amount)}</b>
      </div>)}
      {report.excludedPayrollLike.length>0&&<p className="pl-detail-note">
        {report.excludedPayrollLike.length} pengeluaran manual kategori SDM/payroll tidak dihitung di Biaya Operasional untuk mencegah hitung ganda dengan payroll otomatis.
      </p>}
    </div>

    if(detail==='attendance')return <div className="pl-detail-list">
      {report.attendanceDetail.map(row=><div key={row.employeeId}><span>{row.name} • {row.days} hari × {formatRupiah(row.rate)}</span><b>{formatRupiah(row.amount)}</b></div>)}
    </div>

    if(detail==='allowance')return <div className="pl-detail-list">
      {report.allowanceDetail.map((row,index)=><div key={`${row.employeeId}-${row.month}-${index}`}><span>{row.name} • {row.month} • {row.days}/{row.monthDays} hari</span><b>{formatRupiah(row.amount)}</b></div>)}
    </div>

    if(detail==='bonus')return <div className="pl-detail-list">
      {report.bonusDetail.map((row,index)=><div key={`${row.employeeId}-${row.month}-${index}`}><span>{row.name} • {row.month} • {row.days}/{row.monthDays} hari</span><b>{formatRupiah(row.amount)}</b></div>)}
    </div>

    if(detail==='share')return <div className="pl-detail-list">
      {report.shareDetail.map((row,index)=><div key={`${row.employeeId}-${row.category}-${index}`}><span>{row.name} • {row.category} • {row.percent}%</span><b>{formatRupiah(row.amount)}</b></div>)}
    </div>

    if(detail==='production'||detail==='courier'){
      const rows=detail==='production'?report.productionDetail:report.courierDetail
      return <div className="pl-detail-list">
        {rows.map((row,index)=><div key={`${row.employee_id}-${row.earned_at}-${index}`}><span>{report.employeeMap.get(row.employee_id)||'Karyawan'} • {new Date(row.earned_at).toLocaleDateString('id-ID')}</span><b>{formatRupiah(row.amount)}</b></div>)}
      </div>
    }

    if(detail==='payroll')return <div className="pl-detail-list pl-calc-list">
      <div><span>Uang Hadir</span><b>{formatRupiah(report.attendancePay)}</b></div>
      <div><span>Tunjangan</span><b>{formatRupiah(report.allowance)}</b></div>
      <div><span>Bonus</span><b>{formatRupiah(report.bonus)}</b></div>
      <div><span>Bagi Hasil</span><b>{formatRupiah(report.revenueShare)}</b></div>
      <div><span>Komisi Produksi</span><b>{formatRupiah(report.productionCommission)}</b></div>
      <div><span>Komisi Kurir</span><b>{formatRupiah(report.courierCommission)}</b></div>
      <div className="is-total"><span>Total Biaya Karyawan</span><b>{formatRupiah(report.payroll)}</b></div>
    </div>

    if(detail==='operating_net')return <div className="pl-detail-list pl-calc-list">
      <div><span>Pendapatan</span><b>{formatRupiah(report.revenue)}</b></div>
      <div><span>Biaya Operasional</span><b>- {formatRupiah(report.operating)}</b></div>
      <div><span>Biaya Karyawan</span><b>- {formatRupiah(report.payroll)}</b></div>
      <div className="is-total"><span>Laba Bersih Operasional</span><b>{formatRupiah(report.operatingNet)}</b></div>
    </div>

    if(detail==='reserves')return <div className="pl-detail-list">
      {report.reserveDetail.length===0?<p className="pl-detail-note">Belum ada cadangan aktif.</p>:
        report.reserveDetail.map(row=><div key={row.reserve_type}>
          <span>{row.label} • {row.method==='fixed'?`${formatRupiah(row.monthly_amount)}/bulan`:`${Number(row.revenue_percent||0)}% omzet`}</span>
          <b>{formatRupiah(row.amount)}</b>
        </div>)}
      <div className="is-total"><span>Total Cadangan</span><b>{formatRupiah(report.reserveTotal)}</b></div>
    </div>

    if(detail==='net_after_reserve')return <div className="pl-detail-list pl-calc-list">
      <div><span>Laba Bersih Operasional</span><b>{formatRupiah(report.operatingNet)}</b></div>
      <div><span>Total Cadangan & Kewajiban</span><b>- {formatRupiah(report.reserveTotal)}</b></div>
      <div className="is-total"><span>Laba Bersih Setelah Cadangan</span><b>{formatRupiah(report.netAfterReserve)}</b></div>
    </div>

    return null
  }

  return <>
    <PageHeader
      eyebrow="OWNER FINANCIAL REPORT"
      title="Laporan Laba Rugi"
      description="Pisahkan laba operasional dari laba setelah penyusutan, THR, kesehatan, dan cadangan tak terduga."
      action={<div className="report-actions">
        <button className="secondary-button" onClick={openReserveSettings}><Settings2 size={17}/>Atur Cadangan</button>
        <button className="secondary-button" onClick={()=>downloadFinancialStatementXls(exportOptions())}><FileSpreadsheet size={17}/>XLS</button>
        <button className="secondary-button" onClick={()=>printFinancialStatementPdf(exportOptions())}><FileText size={17}/>PDF</button>
      </div>}
    />

    <section className="panel pl-period-panel">
      <div className="pl-quick-periods">
        <button className={preset==='today'?'is-active':''} onClick={()=>setQuick('today')}>Hari Ini</button>
        <button className={preset==='7d'?'is-active':''} onClick={()=>setQuick('7d')}>7 Hari</button>
        <button className={preset==='month'?'is-active':''} onClick={()=>setQuick('month')}>Bulan Ini</button>
        <button className={preset==='last_month'?'is-active':''} onClick={()=>setQuick('last_month')}>Bulan Lalu</button>
      </div>
      <div className="pl-custom-period">
        <label>Dari<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
        <label>Sampai<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
        <button className="primary-button" onClick={applyCustom}><CalendarDays size={17}/>Terapkan</button>
      </div>
    </section>

    {message&&<div className="error-box inline-message">{message}</div>}

    <section className="stats-grid pl-stats">
      <button className="pl-stat-button" onClick={()=>setDetail('revenue')}><StatCard icon={TrendingUp} label="Pendapatan" value={formatRupiah(report.revenue)} caption={`${report.validOrders.length} order masuk`}/></button>
      <button className="pl-stat-button" onClick={()=>setDetail('operating')}><StatCard icon={TrendingDown} label="Biaya Operasional" value={formatRupiah(report.operating)} caption={`${report.operatingRows.length} transaksi biaya`}/></button>
      <button className="pl-stat-button" onClick={()=>setDetail('payroll')}><StatCard icon={Users} label="Biaya Karyawan" value={formatRupiah(report.payroll)} caption="Gaji, tunjangan, bonus & komisi"/></button>
      <button className="pl-stat-button" onClick={()=>setDetail('operating_net')}><StatCard icon={WalletCards} label="Laba Bersih Operasional" value={formatRupiah(report.operatingNet)} caption={`Margin ${report.operatingMargin.toFixed(1)}%`}/></button>
      <button className="pl-stat-button" onClick={()=>setDetail('net_after_reserve')}><StatCard icon={PiggyBank} label="Laba Setelah Cadangan" value={formatRupiah(report.netAfterReserve)} caption={`Total cadangan ${formatRupiah(report.reserveTotal)}`}/></button>
      <button className="pl-stat-button" onClick={()=>setDetail('cash_surplus')}><StatCard icon={Banknote} label="Surplus Kas Operasional" value={formatRupiah(report.cashOperatingSurplus)} caption="Kas masuk - biaya operasional - biaya karyawan"/></button>
    </section>

    <section className="pl-grid">
      <article className="panel pl-card">
        <div className="panel-heading"><div><h3>Pendapatan</h3><p>Nilai order masuk pada periode terpilih.</p></div></div>
        <button className="pl-row" onClick={()=>setDetail('revenue')}><span>Omzet / Nilai Order Masuk</span><b>{formatRupiah(report.revenue)}</b></button>
        <div className="pl-accounting-note">Pendapatan mengikuti nilai order masuk. Pembayaran dan piutang ditampilkan terpisah agar laba tidak tercampur dengan arus kas.</div>
      </article>

      <article className="panel pl-card">
        <div className="panel-heading"><div><h3>Biaya Operasional</h3><p>Pengeluaran usaha di luar payroll otomatis.</p></div></div>
        {report.operatingByCategory.length===0?<div className="report-empty">Belum ada pengeluaran operasional.</div>:
          report.operatingByCategory.map(([name,value])=><div className="pl-row pl-static-row" key={name}><span>{name}</span><b>{formatRupiah(value)}</b></div>)}
        <button className="pl-row pl-total-row" onClick={()=>setDetail('operating')}><span>Total Biaya Operasional</span><b>{formatRupiah(report.operating)}</b></button>
      </article>

      <article className="panel pl-card">
        <div className="panel-heading"><div><h3>Biaya Karyawan</h3><p>Hak karyawan yang terbentuk dari periode laporan.</p></div></div>
        <button className="pl-row" onClick={()=>setDetail('attendance')}><span>Uang Hadir</span><b>{formatRupiah(report.attendancePay)}</b></button>
        <button className="pl-row" onClick={()=>setDetail('allowance')}><span>Tunjangan <small>akrual proporsional</small></span><b>{formatRupiah(report.allowance)}</b></button>
        <button className="pl-row" onClick={()=>setDetail('bonus')}><span>Bonus <small>akrual proporsional</small></span><b>{formatRupiah(report.bonus)}</b></button>
        <button className="pl-row" onClick={()=>setDetail('share')}><span>Bagi Hasil</span><b>{formatRupiah(report.revenueShare)}</b></button>
        <button className="pl-row" onClick={()=>setDetail('production')}><span>Komisi Produksi</span><b>{formatRupiah(report.productionCommission)}</b></button>
        <button className="pl-row" onClick={()=>setDetail('courier')}><span>Komisi Kurir</span><b>{formatRupiah(report.courierCommission)}</b></button>
        <button className="pl-row pl-total-row" onClick={()=>setDetail('payroll')}><span>Total Biaya Karyawan</span><b>{formatRupiah(report.payroll)}</b></button>
      </article>

      <article className="panel pl-card pl-cash-position-card">
        <div className="panel-heading"><div><h3>Posisi Kas & Piutang</h3><p>Pisahkan uang yang sudah diterima dari pendapatan yang masih harus ditagih.</p></div></div>
        <button className="pl-row pl-info-row" onClick={()=>setDetail('cash')}><span>Kas Masuk <small>uang benar-benar diterima</small></span><b>{formatRupiah(report.cashIn)}</b></button>
        <button className="pl-row pl-info-row" onClick={()=>setDetail('receivable')}><span>Piutang Belum Tertagih <small>bukan pengurang laba</small></span><b>{formatRupiah(report.receivable)}</b></button>
        <button className="pl-row pl-cash-surplus-row" onClick={()=>setDetail('cash_surplus')}><span>Surplus Kas Operasional <small>kas masuk - biaya operasional - biaya karyawan</small></span><b>{formatRupiah(report.cashOperatingSurplus)}</b></button>
      </article>

      <article className="panel pl-card pl-reserve-breakdown-card">
        <div className="panel-heading"><div><h3>Cadangan & Kewajiban</h3><p>Alokasi yang mengurangi laba setelah cadangan, tetapi bukan otomatis kas keluar.</p></div></div>
        {report.reserveDetail.length===0
          ?<div className="report-empty">Belum ada cadangan aktif. Klik <b>Atur Cadangan</b> untuk mengaktifkan.</div>
          :report.reserveDetail.map(row=><button className="pl-row" key={row.reserve_type} onClick={()=>setDetail('reserves')}>
            <span>{row.label}
              <small>{row.method==='fixed'?`${formatRupiah(row.monthly_amount)}/bulan`:`${Number(row.revenue_percent||0)}% omzet`}</small>
            </span>
            <b>{formatRupiah(row.amount)}</b>
          </button>)}
        <button className="pl-row pl-total-row pl-reserve-grand-total" onClick={()=>setDetail('reserves')}>
          <span>Total Cadangan & Kewajiban</span>
          <b>{formatRupiah(report.reserveTotal)}</b>
        </button>
      </article>

      <article className="panel pl-card pl-summary-card">
        <div className="panel-heading"><div><h3>Ringkasan Laba Rugi</h3><p>Laba usaha dipisahkan dari alokasi cadangan/kewajiban.</p></div></div>
        <div className="pl-row pl-static-row"><span>Pendapatan</span><b>{formatRupiah(report.revenue)}</b></div>
        <div className="pl-row pl-static-row"><span>Biaya Operasional</span><b>- {formatRupiah(report.operating)}</b></div>
        <div className="pl-row pl-static-row"><span>Biaya Karyawan</span><b>- {formatRupiah(report.payroll)}</b></div>
        <button className="pl-row pl-grand-total" onClick={()=>setDetail('operating_net')}><span>Laba Bersih Operasional</span><b>{formatRupiah(report.operatingNet)}</b></button>
        <button className="pl-row pl-reserve-total" onClick={()=>setDetail('reserves')}><span>Cadangan & Kewajiban</span><b>- {formatRupiah(report.reserveTotal)}</b></button>
        <button className="pl-row pl-final-total" onClick={()=>setDetail('net_after_reserve')}><span>Laba Bersih Setelah Cadangan</span><b>{formatRupiah(report.netAfterReserve)}</b></button>
        <div className="pl-margin"><span>Margin Setelah Cadangan</span><strong>{report.marginAfterReserve.toFixed(2)}%</strong></div>
        <div className="pl-summary-divider"/>
        <div className="pl-row pl-static-row"><span>Kas Masuk</span><b>{formatRupiah(report.cashIn)}</b></div>
        <div className="pl-row pl-static-row"><span>Piutang Belum Tertagih</span><b>{formatRupiah(report.receivable)}</b></div>
        <button className="pl-row pl-cash-surplus-row" onClick={()=>setDetail('cash_surplus')}><span>Surplus Kas Operasional</span><b>{formatRupiah(report.cashOperatingSurplus)}</b></button>
      </article>
    </section>

    <div className="pl-note">
      <ReceiptText size={17}/>
      <span>Piutang tidak mengurangi laba karena sudah termasuk dalam omzet. Surplus Kas Operasional dipakai untuk melihat uang yang benar-benar masuk setelah Biaya Operasional dan Biaya Karyawan. Cadangan tetap dipisahkan karena bukan otomatis kas keluar.</span>
    </div>

    {loading&&<div className="route-loading"><span/>Memuat laporan laba rugi...</div>}

    {reserveModal&&<Modal title="Atur Cadangan & Kewajiban" onClose={()=>setReserveModal(false)} className="pl-reserve-modal">
      <div className="pl-reserve-form">
        <p className="pl-reserve-intro">Aktifkan cadangan yang ingin dihitung. Metode nominal tetap akan diprorata per hari; metode % omzet mengikuti pendapatan periode.</p>
        {reserveDraft.map(row=><section className="pl-reserve-setting" key={row.reserve_type}>
          <label className="pl-reserve-toggle">
            <input type="checkbox" checked={row.is_active} onChange={e=>updateReserveDraft(row.reserve_type,{is_active:e.target.checked})}/>
            <span><b>{row.label}</b><small>{row.reserve_type==='depreciation'?'Penyusutan mesin/peralatan':row.reserve_type==='thr'?'Kewajiban THR karyawan':row.reserve_type==='health'?'Cadangan kesehatan karyawan':'Dana biaya tidak terduga'}</small></span>
          </label>
          <div className="pl-reserve-fields">
            <label>Metode
              <select value={row.method} onChange={e=>updateReserveDraft(row.reserve_type,{method:e.target.value as ReserveSetting['method']})}>
                <option value="fixed">Nominal per bulan</option>
                <option value="percent_revenue">% dari omzet</option>
              </select>
            </label>
            {row.method==='fixed'
              ?<label>Nominal / bulan<input type="number" min="0" step="1000" value={row.monthly_amount} onChange={e=>updateReserveDraft(row.reserve_type,{monthly_amount:Number(e.target.value)})}/></label>
              :<label>Persentase omzet<input type="number" min="0" max="100" step="0.1" value={row.revenue_percent} onChange={e=>updateReserveDraft(row.reserve_type,{revenue_percent:Number(e.target.value)})}/></label>}
          </div>
        </section>)}
        <div className="modal-actions">
          <button className="secondary-button" onClick={()=>setReserveModal(false)} disabled={savingReserve}>Batal</button>
          <button className="primary-button" onClick={saveReserveSettings} disabled={savingReserve}>{savingReserve?'Menyimpan...':'Simpan Cadangan'}</button>
        </div>
      </div>
    </Modal>}

    {detail&&<Modal title={detailTitle||'Detail'} onClose={()=>setDetail(null)} className="pl-detail-modal">
      {detailContent()}
    </Modal>}
  </>
}
