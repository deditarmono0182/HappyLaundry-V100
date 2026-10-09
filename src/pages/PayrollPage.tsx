import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarCheck2, CheckCircle2, FileSpreadsheet, FileText, Gift,
  HandCoins, Pencil, Plus, ReceiptText, Save, Search, Settings2, Trash2, UsersRound, WalletCards
} from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { downloadXls, printPdf } from '../lib/exportData'
import { formatRupiah } from '../lib/format'
import { supabase } from '../lib/supabase'
import { BUSINESS_TIME_ZONE, businessDateKey, businessMonthKey } from '../lib/businessTime'

type AttendanceStatus='present'|'permission'|'sick'|'absent'

interface Employee{
  id:string
  full_name:string
  login_id:string
  phone:string|null
  is_active:boolean
}

interface Attendance{
  id:string
  employee_id:string
  attendance_date:string
  status:AttendanceStatus
  note:string|null
  attendance_source?:string|null
  check_in_at?:string|null
  override_reason?:string|null
  overridden_at?:string|null
}

interface PayrollSetting{
  employee_id:string
  attendance_rate:number
  monthly_allowance:number
}

interface PayrollShare{
  id?:string
  employee_id:string
  category:string
  share_percent:number
}

interface PayrollAdjustment{
  employee_id:string
  payroll_month:string
  bonus:number
}

interface PayrollPayment{
  id:string
  employee_id:string
  payroll_month:string
  amount:number
  payment_method:string
  note:string|null
  paid_at:string
  created_by:string|null
}

interface CashAdvance{
  id:string
  employee_id:string
  amount:number
  remaining_amount:number
  note:string|null
  issued_at:string
  cancelled_at?:string|null
  cancel_reason?:string|null
}

interface CashAdvanceDeduction{
  id:string
  cash_advance_id:string
  employee_id:string
  payroll_month:string
  amount:number
  created_at:string
}

interface EmployeeCommissionSetting{
  employee_id:string
  production_percent:number
  courier_percent:number
}

interface CommissionLedgerRow{
  order_id:string
  order_no:string
  employee_id:string
  commission_type:'production'|'courier'
  base_amount:number
  percent:number
  amount:number
  earned_at:string
}

interface Payment{
  order_id:string
  amount:number
  created_at:string
}

interface PayrollOrder{
  id:string
  subtotal:number
  total:number
  status:string
  created_at:string
}

interface OrderItem{
  order_id:string
  service_id:string|null
  subtotal:number
}

interface Service{
  id:string
  category:string
}

const statusLabels:Record<AttendanceStatus,string>={
  present:'Hadir',
  permission:'Izin',
  sick:'Sakit',
  absent:'Alpha'
}

const today=()=>businessDateKey()
const currentMonth=()=>businessMonthKey()
const monthRange=(month:string)=>{
  const [y,m]=month.split('-').map(Number)
  const start=`${month}-01`
  const endDate=new Date(y,m,0)
  const end=`${y}-${String(m).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`
  return{start,end}
}

export function PayrollPage(){
  const[employees,setEmployees]=useState<Employee[]>([])
  const[attendance,setAttendance]=useState<Attendance[]>([])
  const[settings,setSettings]=useState<PayrollSetting[]>([])
  const[shares,setShares]=useState<PayrollShare[]>([])
  const[adjustments,setAdjustments]=useState<PayrollAdjustment[]>([])
  const[payrollPayments,setPayrollPayments]=useState<PayrollPayment[]>([])
  const[cashAdvances,setCashAdvances]=useState<CashAdvance[]>([])
  const[cashAdvanceDeductions,setCashAdvanceDeductions]=useState<CashAdvanceDeduction[]>([])
  const[employeeCommissionSettings,setEmployeeCommissionSettings]=useState<EmployeeCommissionSetting[]>([])
  const[commissionLedger,setCommissionLedger]=useState<CommissionLedgerRow[]>([])
  const[payments,setPayments]=useState<Payment[]>([])
  const[orders,setOrders]=useState<PayrollOrder[]>([])
  const[orderItems,setOrderItems]=useState<OrderItem[]>([])
  const[services,setServices]=useState<Service[]>([])
  const[tab,setTab]=useState<'attendance'|'payroll'>('attendance')
  const[attendanceDate,setAttendanceDate]=useState(today())
  const[month,setMonth]=useState(currentMonth())
  const[query,setQuery]=useState('')
  const[message,setMessage]=useState('')
  const[success,setSuccess]=useState('')
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState(false)
  const[settingsEmployee,setSettingsEmployee]=useState<Employee|null>(null)
  const[detailEmployee,setDetailEmployee]=useState<Employee|null>(null)
  const[paymentEmployee,setPaymentEmployee]=useState<Employee|null>(null)
  const[cashAdvanceEmployee,setCashAdvanceEmployee]=useState<Employee|null>(null)
  const[cashAdvanceForm,setCashAdvanceForm]=useState({amount:'0',note:''})
  const[cancelCashAdvance,setCancelCashAdvance]=useState<CashAdvance|null>(null)
  const[cancelCashAdvanceReason,setCancelCashAdvanceReason]=useState('')
  const[correctCashAdvance,setCorrectCashAdvance]=useState<CashAdvance|null>(null)
  const[correctCashAdvanceForm,setCorrectCashAdvanceForm]=useState({amount:'0',note:'',reason:''})
  const[deductCashAdvanceEmployee,setDeductCashAdvanceEmployee]=useState<Employee|null>(null)
  const[cashAdvanceDeductionAmount,setCashAdvanceDeductionAmount]=useState('')
  const[paymentForm,setPaymentForm]=useState({amount:'0',payment_method:'Transfer',note:''})
  const[settingForm,setSettingForm]=useState({
    attendance_rate:'0',
    monthly_allowance:'0',
    production_percent:'0',
    courier_percent:'0'
  })
  const[shareDraft,setShareDraft]=useState<Array<{category:string;share_percent:string}>>([])
  const[bonusDraft,setBonusDraft]=useState<Record<string,string>>({})
  const[overrideTarget,setOverrideTarget]=useState<{employee:Employee;status:AttendanceStatus}|null>(null)
  const[overrideReason,setOverrideReason]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const range=monthRange(month)
    const [e,a,s,shr,adj,payrollPay,ca,cd,ecs,ledger,p,o,oi,sv]=await Promise.all([
      supabase.from('v109_users').select('id,full_name,login_id,phone,is_active').eq('is_active',true).order('full_name'),
      supabase.from('v111_attendance').select('*').gte('attendance_date',range.start).lte('attendance_date',range.end),
      supabase.from('v111_employee_payroll_settings').select('*'),
      supabase.from('v111_employee_revenue_shares').select('*'),
      supabase.from('v111_payroll_adjustments').select('*').eq('payroll_month',range.start),
      supabase.from('v113_payroll_payments').select('*').eq('payroll_month',range.start).order('paid_at',{ascending:false}),
      supabase.from('v113072_employee_cash_advances').select('id,employee_id,amount,remaining_amount,note,issued_at,cancelled_at,cancel_reason').order('issued_at',{ascending:false}),
      supabase.from('v113072_cash_advance_deductions').select('id,cash_advance_id,employee_id,payroll_month,amount,created_at').eq('payroll_month',range.start),
      supabase.from('v113_employee_commission_settings').select('*'),
      supabase.from('v113_commission_ledger').select('*').gte('earned_at',`${range.start}T00:00:00`).lte('earned_at',`${range.end}T23:59:59.999`),
      supabase.from('v100_payments').select('order_id,amount,created_at').gte('created_at',`${range.start}T00:00:00`).lte('created_at',`${range.end}T23:59:59.999`),
      supabase.from('v100_orders_view').select('id,subtotal,total,status,created_at').gte('created_at',`${range.start}T00:00:00`).lte('created_at',`${range.end}T23:59:59.999`),
      supabase.from('v100_order_items').select('order_id,service_id,subtotal'),
      supabase.from('v100_services').select('id,category')
    ])
    const error=e.error||a.error||s.error||shr.error||adj.error||payrollPay.error||ca.error||cd.error||ecs.error||ledger.error||p.error||o.error||oi.error||sv.error
    if(error)setMessage(error.message)
    else{
      setEmployees((e.data as Employee[])||[])
      setAttendance((a.data as Attendance[])||[])
      setSettings((s.data as PayrollSetting[])||[])
      setShares((shr.data as PayrollShare[])||[])
      setAdjustments((adj.data as PayrollAdjustment[])||[])
      setPayrollPayments((payrollPay.data as PayrollPayment[])||[])
      setCashAdvances((ca.data as CashAdvance[])||[])
      setCashAdvanceDeductions((cd.data as CashAdvanceDeduction[])||[])
      setEmployeeCommissionSettings((ecs.data as EmployeeCommissionSetting[])||[])
      setCommissionLedger((ledger.data as CommissionLedgerRow[])||[])
      setPayments((p.data as Payment[])||[])
      setOrders((o.data as PayrollOrder[])||[])
      setOrderItems((oi.data as OrderItem[])||[])
      setServices((sv.data as Service[])||[])
      const drafts:Record<string,string>={}
      for(const row of (adj.data as PayrollAdjustment[])||[])drafts[row.employee_id]=String(Number(row.bonus||0))
      setBonusDraft(drafts)
    }
    setLoading(false)
  },[month])

  useEffect(()=>{void load()},[load])

  // V113.0.52 - Owner dashboard mengikuti pergantian hari operasional WIB,
  // bukan zona waktu perangkat Owner. Jika halaman tetap terbuka melewati 00:00 WIB,
  // tanggal absensi otomatis pindah ke hari baru.
  useEffect(()=>{
    let lastDate=businessDateKey()
    const syncBusinessDate=()=>{
      const nextDate=businessDateKey()
      if(nextDate===lastDate)return
      lastDate=nextDate
      setAttendanceDate(nextDate)
      setMonth(businessMonthKey())
    }
    const timer=window.setInterval(syncBusinessDate,30000)
    const onFocus=()=>syncBusinessDate()
    window.addEventListener('focus',onFocus)
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',onFocus)}
  },[])

  const attendanceMap=useMemo(()=>{
    const map=new Map<string,Attendance>()
    attendance.forEach(a=>map.set(`${a.employee_id}|${a.attendance_date}`,a))
    return map
  },[attendance])

  const settingMap=useMemo(()=>new Map(settings.map(s=>[s.employee_id,s])),[settings])
  const employeeCommissionSettingMap=useMemo(()=>new Map(employeeCommissionSettings.map(s=>[s.employee_id,s])),[employeeCommissionSettings])

  const sharesByEmployee=useMemo(()=>{
    const map=new Map<string,PayrollShare[]>()
    for(const share of shares){
      const list=map.get(share.employee_id)||[]
      list.push(share)
      map.set(share.employee_id,list)
    }
    return map
  },[shares])
  const adjustmentMap=useMemo(()=>new Map(adjustments.map(a=>[a.employee_id,a])),[adjustments])

  const monthlyRevenue=payments.reduce((sum,p)=>sum+Number(p.amount||0),0)

  const categoryRevenue=useMemo(()=>{
    const serviceCategory=new Map(services.map(service=>[
      service.id,(service.category||'Kiloan').trim()||'Kiloan'
    ]))

    const itemsByOrder=new Map<string,OrderItem[]>()
    for(const item of orderItems){
      const list=itemsByOrder.get(item.order_id)||[]
      list.push(item)
      itemsByOrder.set(item.order_id,list)
    }

    const grouped:Record<string,number>={}

    // V113.0.76: dasar bagi hasil = nilai order/barang masuk bulan tersebut,
    // sama dengan dashboard dan rincian Keuangan.
    for(const order of orders){
      if(order.status==='cancelled')continue
      const orderTotal=Math.max(0,Number(order.total||0))
      if(orderTotal<=0)continue
      const items=itemsByOrder.get(order.id)||[]
      const itemTotal=items.reduce((sum,item)=>sum+Math.max(0,Number(item.subtotal||0)),0)

      if(items.length===0||itemTotal<=0){
        grouped['Kiloan']=(grouped['Kiloan']||0)+orderTotal
        continue
      }

      for(const item of items){
        const subtotal=Math.max(0,Number(item.subtotal||0))
        if(subtotal<=0)continue
        const category=item.service_id
          ? serviceCategory.get(item.service_id)||'Kiloan'
          : 'Kiloan'
        grouped[category]=(grouped[category]||0)+(orderTotal*(subtotal/itemTotal))
      }
    }

    return grouped
  },[orders,orderItems,services])

  const serviceCategories=useMemo(()=>Array.from(new Set([
    ...services.map(s=>(s.category||'Kiloan').trim()||'Kiloan'),
    ...Object.keys(categoryRevenue),
    'Kiloan','Satuan','Express','Premium'
  ])).sort((a,b)=>a.localeCompare(b,'id')),[services,categoryRevenue])

  const payrollRows=useMemo(()=>employees.map(employee=>{
    const setting=settingMap.get(employee.id)
    const presentDays=attendance.filter(a=>a.employee_id===employee.id&&a.status==='present').length
    const permissionDays=attendance.filter(a=>a.employee_id===employee.id&&a.status==='permission').length
    const sickDays=attendance.filter(a=>a.employee_id===employee.id&&a.status==='sick').length
    const absentDays=attendance.filter(a=>a.employee_id===employee.id&&a.status==='absent').length
    const attendanceRate=Number(setting?.attendance_rate||0)
    const attendancePay=presentDays*attendanceRate
    const allowance=Number(setting?.monthly_allowance||0)

    const employeeShares=sharesByEmployee.get(employee.id)||[]
    const shareDetails=employeeShares.map(share=>{
      const baseRevenue=Number(categoryRevenue[share.category]||0)
      const percent=Number(share.share_percent||0)
      const amount=baseRevenue*(percent/100)
      return{
        category:share.category,
        percent,
        baseRevenue,
        amount
      }
    })
    const revenueShare=shareDetails.reduce((sum,item)=>sum+item.amount,0)

    const employeeLedger=commissionLedger.filter(item=>item.employee_id===employee.id)
    const productionCommission=employeeLedger
      .filter(item=>item.commission_type==='production')
      .reduce((sum,item)=>sum+Number(item.amount||0),0)
    const courierCommission=employeeLedger
      .filter(item=>item.commission_type==='courier')
      .reduce((sum,item)=>sum+Number(item.amount||0),0)
    const orderCommission=productionCommission+courierCommission

    const bonus=Number(bonusDraft[employee.id]??adjustmentMap.get(employee.id)?.bonus??0)
    const grossTotal=attendancePay+allowance+bonus+revenueShare+orderCommission
    const cashAdvanceApplied=cashAdvanceDeductions
      .filter(item=>item.employee_id===employee.id)
      .reduce((sum,item)=>sum+Number(item.amount||0),0)
    const cashAdvanceOutstanding=cashAdvances
      .filter(item=>item.employee_id===employee.id&&!item.cancelled_at)
      .reduce((sum,item)=>sum+Number(item.remaining_amount||0),0)
    const total=Math.max(0,grossTotal-cashAdvanceApplied)
    const payrollBalance=total-cashAdvanceOutstanding
    const paymentHistory=payrollPayments.filter(item=>item.employee_id===employee.id)
    const paidAmount=paymentHistory.reduce((sum,item)=>sum+Number(item.amount||0),0)
    const outstanding=Math.max(0,total-paidAmount)
    const paymentStatus=grossTotal>0&&total<=0&&cashAdvanceApplied>0?'cashbon':total<=0&&paidAmount<=0?'nil':paidAmount<=0?'unpaid':outstanding>0?'partial':'paid'

    return{
      employee,presentDays,permissionDays,sickDays,absentDays,
      attendanceRate,attendancePay,allowance,
      shareDetails,revenueShare,productionCommission,courierCommission,orderCommission,
      commissionOrderCount:new Set(employeeLedger.map(item=>item.order_id)).size,
      commissionDetails:[...employeeLedger].sort((a,b)=>new Date(b.earned_at).getTime()-new Date(a.earned_at).getTime()),
      bonus,grossTotal,cashAdvanceApplied,cashAdvanceOutstanding,total,payrollBalance,paymentHistory,paidAmount,outstanding,paymentStatus
    }
  }),[employees,settingMap,sharesByEmployee,attendance,categoryRevenue,commissionLedger,bonusDraft,adjustmentMap,payrollPayments,cashAdvances,cashAdvanceDeductions])

  const filteredEmployees=useMemo(()=>{
    const key=query.toLowerCase().trim()
    if(!key)return employees
    return employees.filter(e=>`${e.full_name} ${e.login_id} ${e.phone||''}`.toLowerCase().includes(key))
  },[employees,query])

  const filteredPayroll=useMemo(()=>{
    const ids=new Set(filteredEmployees.map(e=>e.id))
    return payrollRows.filter(r=>ids.has(r.employee.id))
  },[payrollRows,filteredEmployees])

  const setAttendanceStatus=(employee:Employee,status:AttendanceStatus)=>{
    const existing=attendanceMap.get(`${employee.id}|${attendanceDate}`)
    setOverrideTarget({employee,status})
    setOverrideReason(
      status==='present' && !existing
        ? 'Kendala koneksi / GPS / QR'
        : existing?.override_reason||''
    )
    setMessage('')
    setSuccess('')
  }

  const saveAttendanceOverride=async(event:FormEvent)=>{
    event.preventDefault()
    if(!overrideTarget)return

    const reason=overrideReason.trim()
    if(!reason){
      setMessage('Alasan perubahan absensi wajib diisi.')
      return
    }

    setBusy(true)
    setMessage('')
    setSuccess('')

    const{data,error}=await supabase.rpc('v111_owner_override_attendance',{
      p_employee_id:overrideTarget.employee.id,
      p_attendance_date:attendanceDate,
      p_status:overrideTarget.status,
      p_reason:reason
    })

    if(error){
      setMessage(error.message)
      setBusy(false)
      return
    }

    const result=(Array.isArray(data)?data[0]:data) as {message?:string}|null
    setOverrideTarget(null)
    setOverrideReason('')
    setSuccess(result?.message||`${overrideTarget.employee.full_name}: ${statusLabels[overrideTarget.status]} berhasil disimpan.`)
    await load()
    setBusy(false)
  }

  const openSettings=(employee:Employee)=>{
    const row=settingMap.get(employee.id)
    setSettingsEmployee(employee)
    const commissionRow=employeeCommissionSettingMap.get(employee.id)
    setSettingForm({
      attendance_rate:String(Number(row?.attendance_rate||0)),
      monthly_allowance:String(Number(row?.monthly_allowance||0)),
      production_percent:String(Number(commissionRow?.production_percent||0)),
      courier_percent:String(Number(commissionRow?.courier_percent||0))
    })
    const employeeShares=sharesByEmployee.get(employee.id)||[]
    setShareDraft(
      employeeShares.length
        ? employeeShares.map(item=>({
            category:item.category,
            share_percent:String(Number(item.share_percent||0))
          }))
        : [{category:'Kiloan',share_percent:'0'}]
    )
    setMessage('')
  }

  const saveSettings=async(event:FormEvent)=>{
    event.preventDefault()
    if(!settingsEmployee)return
    setBusy(true);setMessage('')
    const payload={
      employee_id:settingsEmployee.id,
      attendance_rate:Math.max(0,Number(settingForm.attendance_rate)||0),
      monthly_allowance:Math.max(0,Number(settingForm.monthly_allowance)||0),
      updated_at:new Date().toISOString()
    }

    const cleanShares=shareDraft
      .map(item=>({
        employee_id:settingsEmployee.id,
        category:item.category,
        share_percent:Math.max(0,Math.min(100,Number(item.share_percent)||0)),
        updated_at:new Date().toISOString()
      }))
      .filter((item,index,array)=>
        item.category&&
        array.findIndex(x=>x.category===item.category)===index
      )

    const settingsResult=await supabase
      .from('v111_employee_payroll_settings')
      .upsert(payload,{onConflict:'employee_id'})

    if(settingsResult.error){
      setMessage(settingsResult.error.message)
      setBusy(false)
      return
    }

    const commissionSettingsResult=await supabase
      .from('v113_employee_commission_settings')
      .upsert({
        employee_id:settingsEmployee.id,
        production_percent:Math.max(0,Math.min(100,Number(settingForm.production_percent)||0)),
        courier_percent:Math.max(0,Math.min(100,Number(settingForm.courier_percent)||0)),
        updated_at:new Date().toISOString()
      },{onConflict:'employee_id'})

    if(commissionSettingsResult.error){
      setMessage(commissionSettingsResult.error.message)
      setBusy(false)
      return
    }

    const deleteResult=await supabase
      .from('v111_employee_revenue_shares')
      .delete()
      .eq('employee_id',settingsEmployee.id)

    if(deleteResult.error){
      setMessage(deleteResult.error.message)
      setBusy(false)
      return
    }

    if(cleanShares.length){
      const insertResult=await supabase
        .from('v111_employee_revenue_shares')
        .insert(cleanShares)
      if(insertResult.error){
        setMessage(insertResult.error.message)
        setBusy(false)
        return
      }
    }

    setSettingsEmployee(null)
    setSuccess(`Komponen gaji ${settingsEmployee.full_name} berhasil disimpan.`)
    await load()
    setBusy(false)
  }

  const saveBonuses=async()=>{
    setBusy(true);setMessage('');setSuccess('')
    const range=monthRange(month)
    const payload=employees.map(employee=>({
      employee_id:employee.id,
      payroll_month:range.start,
      bonus:Math.max(0,Number(bonusDraft[employee.id]||0)),
      updated_at:new Date().toISOString()
    }))
    const{error}=await supabase
      .from('v111_payroll_adjustments')
      .upsert(payload,{onConflict:'employee_id,payroll_month'})
    if(error)setMessage(error.message)
    else{
      setSuccess('Bonus bulanan berhasil disimpan.')
      await load()
    }
    setBusy(false)
  }

  const openPayrollPayment=(employee:Employee)=>{
    const row=payrollRows.find(item=>item.employee.id===employee.id)
    const outstanding=Math.max(0,Number(row?.outstanding||0))
    setPaymentEmployee(employee)
    setPaymentForm({amount:String(Math.round(outstanding)),payment_method:'Transfer',note:''})
    setMessage('')
    setSuccess('')
  }

  const openCashAdvance=(employee:Employee)=>{
    setCashAdvanceEmployee(employee)
    setCashAdvanceForm({amount:'0',note:''})
    setMessage('');setSuccess('')
  }

  const saveCashAdvance=async(event:FormEvent)=>{
    event.preventDefault()
    if(!cashAdvanceEmployee)return
    const amount=Math.max(0,Number(cashAdvanceForm.amount)||0)
    if(amount<=0){setMessage('Nominal kas bon harus lebih dari Rp 0.');return}
    setBusy(true);setMessage('');setSuccess('')
    const add=await supabase.rpc('v113072_add_cash_advance',{
      p_employee_id:cashAdvanceEmployee.id,
      p_amount:amount,
      p_note:cashAdvanceForm.note.trim()||null
    })
    if(add.error){setMessage(add.error.message);setBusy(false);return}

    const row=payrollRows.find(item=>item.employee.id===cashAdvanceEmployee.id)
    const available=Math.max(0,Number(row?.grossTotal||0)-Number(row?.cashAdvanceApplied||0))
    const deduction=Math.min(amount,available)
    if(deduction>0){
      const apply=await supabase.rpc('v113072_apply_cash_advance_deduction',{
        p_employee_id:cashAdvanceEmployee.id,
        p_payroll_month:monthRange(month).start,
        p_amount:deduction
      })
      if(apply.error){setMessage(`Kas bon tersimpan, tetapi potongan gaji gagal: ${apply.error.message}`);setBusy(false);await load();return}
    }

    const employeeName=cashAdvanceEmployee.full_name
    setCashAdvanceEmployee(null)
    setCashAdvanceForm({amount:'0',note:''})
    setSuccess(`Kas bon ${employeeName} sebesar ${formatRupiah(amount)} berhasil dicatat${deduction>0?` dan ${formatRupiah(deduction)} langsung dipotong dari gaji periode ini.`:'.'}`)
    await load()
    setBusy(false)
  }

  const openCashAdvanceDeduction=(employee:Employee)=>{
    const row=payrollRows.find(item=>item.employee.id===employee.id)
    const availableSalary=Math.max(0,Number(row?.grossTotal||0)-Number(row?.cashAdvanceApplied||0))
    const outstandingCashAdvance=Math.max(0,Number(row?.cashAdvanceOutstanding||0))
    setDeductCashAdvanceEmployee(employee)
    setCashAdvanceDeductionAmount(String(Math.floor(Math.min(availableSalary,outstandingCashAdvance))))
    setMessage('');setSuccess('')
  }

  const saveCashAdvanceDeduction=async(event:FormEvent)=>{
    event.preventDefault()
    if(!deductCashAdvanceEmployee)return
    const row=payrollRows.find(item=>item.employee.id===deductCashAdvanceEmployee.id)
    const availableSalary=Math.max(0,Number(row?.grossTotal||0)-Number(row?.cashAdvanceApplied||0))
    const outstandingCashAdvance=Math.max(0,Number(row?.cashAdvanceOutstanding||0))
    const amount=Math.max(0,Number(cashAdvanceDeductionAmount)||0)
    const maxAmount=Math.min(availableSalary,outstandingCashAdvance)
    if(amount<=0){setMessage('Nominal potongan harus lebih dari Rp 0.');return}
    if(amount>maxAmount+0.01){setMessage(`Potongan maksimal ${formatRupiah(maxAmount)}.`);return}

    setBusy(true);setMessage('');setSuccess('')
    const result=await supabase.rpc('v113072_apply_cash_advance_deduction',{
      p_employee_id:deductCashAdvanceEmployee.id,
      p_payroll_month:monthRange(month).start,
      p_amount:amount
    })
    if(result.error){
      setMessage(result.error.message)
      setBusy(false)
      return
    }
    const employeeName=deductCashAdvanceEmployee.full_name
    setDeductCashAdvanceEmployee(null)
    setCashAdvanceDeductionAmount('')
    setSuccess(`Kas bon ${employeeName} berhasil dipotong dari gaji sebesar ${formatRupiah(Number(result.data||amount))}.`)
    await load()
    setBusy(false)
  }

  const openCorrectCashAdvance=(item:CashAdvance)=>{
    setCorrectCashAdvance(item)
    setCorrectCashAdvanceForm({
      amount:String(Number(item.amount||0)),
      note:item.note||'',
      reason:''
    })
    setMessage('')
    setSuccess('')
  }

  const saveCorrectCashAdvance=async(event:FormEvent)=>{
    event.preventDefault()
    if(!correctCashAdvance)return

    const amount=Math.max(0,Number(correctCashAdvanceForm.amount)||0)
    const deducted=Math.max(0,Number(correctCashAdvance.amount||0)-Number(correctCashAdvance.remaining_amount||0))
    const reason=correctCashAdvanceForm.reason.trim()

    if(amount<=0){setMessage('Nominal kas bon harus lebih dari Rp 0.');return}
    if(amount+0.01<deducted){
      setMessage(`Nominal tidak boleh lebih kecil dari kas bon yang sudah dipotong (${formatRupiah(deducted)}).`)
      return
    }
    if(reason.length<5){
      setMessage('Alasan koreksi minimal 5 karakter.')
      return
    }

    setBusy(true);setMessage('');setSuccess('')
    const result=await supabase.rpc('v113123_owner_correct_cash_advance',{
      p_cash_advance_id:correctCashAdvance.id,
      p_new_amount:amount,
      p_new_note:correctCashAdvanceForm.note.trim()||null,
      p_reason:reason
    })
    if(result.error){
      setMessage(result.error.message)
      setBusy(false)
      return
    }

    setCorrectCashAdvance(null)
    setCorrectCashAdvanceForm({amount:'0',note:'',reason:''})
    setSuccess('Koreksi kas bon berhasil disimpan. Sisa kas bon dan audit koreksi sudah diperbarui.')
    await load()
    setBusy(false)
  }

  const confirmCancelCashAdvance=async(event:FormEvent)=>{
    event.preventDefault()
    if(!cancelCashAdvance)return
    const reason=cancelCashAdvanceReason.trim()
    if(!reason){setMessage('Alasan pembatalan kas bon wajib diisi.');return}
    setBusy(true);setMessage('');setSuccess('')
    const result=await supabase.rpc('v113074_cancel_cash_advance',{
      p_cash_advance_id:cancelCashAdvance.id,
      p_reason:reason
    })
    if(result.error){setMessage(result.error.message);setBusy(false);return}
    setCancelCashAdvance(null);setCancelCashAdvanceReason('')
    setSuccess('Kas bon berhasil dibatalkan. Potongan gaji yang belum dibayar sudah dikembalikan otomatis.')
    await load()
    setBusy(false)
  }

  const savePayrollPayment=async(event:FormEvent)=>{
    event.preventDefault()
    if(!paymentEmployee)return
    const row=payrollRows.find(item=>item.employee.id===paymentEmployee.id)
    const outstanding=Math.max(0,Number(row?.outstanding||0))
    const amount=Math.max(0,Number(paymentForm.amount)||0)
    if(amount<=0){setMessage('Nominal pembayaran harus lebih dari Rp 0.');return}
    if(amount>outstanding+0.01){setMessage(`Nominal melebihi sisa gaji ${formatRupiah(outstanding)}.`);return}
    setBusy(true);setMessage('');setSuccess('')
    const range=monthRange(month)
    const{error}=await supabase.from('v113_payroll_payments').insert({
      employee_id:paymentEmployee.id,
      payroll_month:range.start,
      amount,
      payment_method:paymentForm.payment_method,
      note:paymentForm.note.trim()||null,
      paid_at:new Date().toISOString()
    })
    if(error){setMessage(error.message);setBusy(false);return}
    const employeeName=paymentEmployee.full_name
    setPaymentEmployee(null)
    setPaymentForm({amount:'0',payment_method:'Transfer',note:''})
    setSuccess(`Pembayaran gaji ${employeeName} sebesar ${formatRupiah(amount)} berhasil dicatat.`)
    await load()
    setBusy(false)
  }

  const attendanceExport=()=>({
    title:'Daftar Hadir Karyawan',
    filename:`absensi-${month}`,
    subtitle:`Periode ${month}`,
    headers:['Karyawan','ID Akun','Hadir','Izin','Sakit','Alpha'],
    rows:filteredPayroll.map(r=>[
      r.employee.full_name,r.employee.login_id,
      r.presentDays,r.permissionDays,r.sickDays,r.absentDays
    ]),
    summary:[
      ['Total Karyawan',filteredPayroll.length],
      ['Total Kehadiran',filteredPayroll.reduce((s,r)=>s+r.presentDays,0)]
    ] as Array<[string,string|number]>
  })

  const payrollExport=()=>({
    title:'Daftar Gaji Karyawan',
    filename:`gaji-karyawan-${month}`,
    subtitle:`Periode ${month} • Omzet aktual ${formatRupiah(monthlyRevenue)}`,
    headers:['Karyawan','Hadir','Tarif/Hari','Uang Kehadiran','Tunjangan','Bonus','Bagi Hasil Kategori','Komisi Produksi','Komisi Kurir','Gaji Kotor','Potongan Kas Bon','Gaji Bersih','Sudah Dibayar','Sisa','Status'],
    rows:filteredPayroll.map(r=>[
      r.employee.full_name,r.presentDays,r.attendanceRate,
      Math.round(r.attendancePay),Math.round(r.allowance),Math.round(r.bonus),
      r.shareDetails.length
        ? r.shareDetails.map(item=>`${item.category} ${item.percent.toFixed(2)}% x ${Math.round(item.baseRevenue)} = ${Math.round(item.amount)}`).join(' | ')
        : '-',
      Math.round(r.productionCommission),Math.round(r.courierCommission),Math.round(r.grossTotal),Math.round(r.cashAdvanceApplied),Math.round(r.total),
      Math.round(r.paidAmount),Math.round(r.outstanding),r.paymentStatus==='cashbon'?'Terpotong Kas Bon':r.paymentStatus==='nil'?'Nihil':r.paymentStatus==='paid'?'Lunas':r.paymentStatus==='partial'?'Sebagian':'Belum Dibayar'
    ]),
    summary:[
      ['Omzet Bulan',Math.round(monthlyRevenue)],
      ['Total Gaji Kotor',Math.round(filteredPayroll.reduce((s,r)=>s+r.grossTotal,0))],
      ['Potongan Kas Bon',Math.round(filteredPayroll.reduce((s,r)=>s+r.cashAdvanceApplied,0))],
      ['Total Gaji Bersih',Math.round(filteredPayroll.reduce((s,r)=>s+r.total,0))]
    ] as Array<[string,string|number]>
  })

  const commissionDetailExport=(employee:Employee)=>{
    const row=payrollRows.find(item=>item.employee.id===employee.id)
    const details=row?.commissionDetails||[]
    return{
      title:`Detail Gaji & Komisi — ${employee.full_name}`,
      filename:`detail-gaji-komisi-${employee.login_id||employee.full_name}-${month}`,
      subtitle:`Periode ${month} • ID Akun ${employee.login_id||'-'}`,
      headers:['No. Order','Peran','Nilai Order','Persentase','Komisi','Tanggal Hak'],
      rows:details.map(item=>[
        item.order_no,
        item.commission_type==='production'?'Produksi':'Kurir',
        Math.round(Number(item.base_amount||0)),
        `${Number(item.percent||0).toFixed(2)}%`,
        Math.round(Number(item.amount||0)),
        new Date(item.earned_at).toLocaleString('id-ID')
      ]),
      summary:[
        ['Uang Kehadiran',Math.round(row?.attendancePay||0)],
        ['Tunjangan',Math.round(row?.allowance||0)],
        ['Bonus',Math.round(row?.bonus||0)],
        ['Bagi Hasil Kategori',Math.round(row?.revenueShare||0)],
        ['Komisi Produksi',Math.round(row?.productionCommission||0)],
        ['Komisi Kurir',Math.round(row?.courierCommission||0)],
        ['Total Komisi Order',Math.round(row?.orderCommission||0)],
        ['Gaji Kotor',Math.round(row?.grossTotal||0)],
        ['Potongan Kas Bon',Math.round(row?.cashAdvanceApplied||0)],
        ['Sisa Kas Bon',Math.round(row?.cashAdvanceOutstanding||0)],
        ['Gaji Bersih',Math.round(row?.total||0)],
        ['Sudah Dibayar',Math.round(row?.paidAmount||0)],
        ['Sisa Gaji',Math.round(row?.outstanding||0)],
        ['Status Pembayaran',row?.paymentStatus==='cashbon'?'Terpotong Kas Bon':row?.paymentStatus==='nil'?'Nihil':row?.paymentStatus==='paid'?'Lunas':row?.paymentStatus==='partial'?'Sebagian':'Belum Dibayar'],
        ...((row?.paymentHistory||[]).map((payment,index)=>[
          `Pembayaran ${index+1}`,
          `${new Date(payment.paid_at).toLocaleString('id-ID')} • ${payment.payment_method} • ${formatRupiah(Number(payment.amount||0))}${payment.note?` • ${payment.note}`:''}`
        ] as [string,string|number]))
      ] as Array<[string,string|number]>
    }
  }

  const totalPayroll=payrollRows.reduce((sum,r)=>sum+r.total,0)
  const totalCashAdvanceApplied=payrollRows.reduce((sum,r)=>sum+r.cashAdvanceApplied,0)
  const totalCashAdvanceOutstanding=payrollRows.reduce((sum,r)=>sum+r.cashAdvanceOutstanding,0)
  const totalPresent=payrollRows.reduce((sum,r)=>sum+r.presentDays,0)
  const totalOrderCommission=payrollRows.reduce((sum,r)=>sum+r.orderCommission,0)
  const totalPaidPayroll=payrollRows.reduce((sum,r)=>sum+r.paidAmount,0)
  const totalOutstandingPayroll=payrollRows.reduce((sum,r)=>sum+r.outstanding,0)

  return <>
    <PageHeader
      eyebrow="HR & PAYROLL"
      title="Absensi & Penggajian"
      description="Kelola kehadiran dan hitung gaji dari uang hadir, tunjangan, bonus, bagi hasil kategori, serta komisi per order."
      action={<div className="payroll-page-actions">
        <button className="secondary-button" onClick={()=>downloadXls(tab==='attendance'?attendanceExport():payrollExport())}><FileSpreadsheet size={16}/>XLS</button>
        <button className="secondary-button" onClick={()=>printPdf(tab==='attendance'?attendanceExport():payrollExport())}><FileText size={16}/>PDF</button>
      </div>}
    />

    <section className="panel payroll-toolbar">
      <div className="payroll-tabs">
        <button className={tab==='attendance'?'active':''} onClick={()=>setTab('attendance')}><CalendarCheck2 size={17}/>Daftar Hadir</button>
        <button className={tab==='payroll'?'active':''} onClick={()=>setTab('payroll')}><WalletCards size={17}/>Daftar Gaji</button>
      </div>
      <label>Bulan<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
      {tab==='attendance'&&<label>Tanggal<input type="date" value={attendanceDate} onChange={e=>setAttendanceDate(e.target.value)}/></label>}
      <label className="search-box payroll-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari karyawan atau ID Akun"/></label>
    </section>

    {message&&<div className="error-box inline-message">{message}</div>}
    {success&&<div className="success-box inline-message"><CheckCircle2 size={17}/>{success}</div>}

    {tab==='attendance'?<>
      <section className="panel attendance-auto-info">
        <CalendarCheck2 size={20}/>
        <div>
          <b>Absensi QR + GPS Aktif</b>
          <span>Login saja tidak dihitung Hadir. Karyawan harus scan QR toko dan lolos verifikasi radius GPS. Owner tetap dapat override manual jika ada kendala.</span>
        </div>
      </section>

      <section className="stats-grid payroll-stats">
        <StatCard icon={UsersRound} label="Karyawan Aktif" value={String(employees.length)} caption="Karyawan yang dapat diabsen"/>
        <StatCard icon={CalendarCheck2} label="Total Hadir Bulan Ini" value={String(totalPresent)} caption="Akumulasi hari hadir"/>
        <StatCard icon={HandCoins} label="Omzet Bulan Ini" value={formatRupiah(monthlyRevenue)} caption="Bagi hasil dari nilai barang / order masuk"/>
      </section>

      <section className="panel data-panel">
        <div className="attendance-date-title">
          <div><b>Absensi {new Intl.DateTimeFormat('id-ID',{timeZone:BUSINESS_TIME_ZONE,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${attendanceDate}T12:00:00+07:00`))}</b><small>Klik status untuk mencatat atau mengubah kehadiran.</small></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Karyawan</th><th>ID Akun</th><th>Status Hari Ini</th><th>Pilih Kehadiran</th></tr></thead>
            <tbody>
              {loading&&<tr><td colSpan={4} className="table-empty">Memuat absensi...</td></tr>}
              {!loading&&filteredEmployees.length===0&&<tr><td colSpan={4} className="table-empty">Tidak ada karyawan.</td></tr>}
              {filteredEmployees.map(employee=>{
                const current=attendanceMap.get(`${employee.id}|${attendanceDate}`)?.status
                return <tr key={employee.id}>
                  <td><b>{employee.full_name}</b>{employee.phone&&<small>{employee.phone}</small>}</td>
                  <td><b>{employee.login_id}</b></td>
                  <td>
                    <span className={`attendance-badge attendance-${current||'none'}`}>{current?statusLabels[current]:'Belum Absen'}</span>
                    {attendanceMap.get(`${employee.id}|${attendanceDate}`)?.attendance_source==='login'&&
                      <small className="attendance-auto-note">
                        Auto Login
                        {attendanceMap.get(`${employee.id}|${attendanceDate}`)?.check_in_at
                          ? ` • ${new Intl.DateTimeFormat('id-ID',{timeZone:BUSINESS_TIME_ZONE,hour:'2-digit',minute:'2-digit'}).format(new Date(attendanceMap.get(`${employee.id}|${attendanceDate}`)!.check_in_at!))}`
                          : ''}
                      </small>}
                    {attendanceMap.get(`${employee.id}|${attendanceDate}`)?.attendance_source==='owner_override'&&
                      <small className="attendance-owner-note" title={attendanceMap.get(`${employee.id}|${attendanceDate}`)?.override_reason||''}>
                        Manual Owner
                        {attendanceMap.get(`${employee.id}|${attendanceDate}`)?.override_reason
                          ? ` • ${attendanceMap.get(`${employee.id}|${attendanceDate}`)!.override_reason}`
                          : ''}
                      </small>}
                    {attendanceMap.get(`${employee.id}|${attendanceDate}`)?.attendance_source==='qr_gps'&&
                      <small className="attendance-qr-gps-note">
                        QR + GPS
                        {attendanceMap.get(`${employee.id}|${attendanceDate}`)?.check_in_at
                          ? ` • ${new Intl.DateTimeFormat('id-ID',{timeZone:BUSINESS_TIME_ZONE,hour:'2-digit',minute:'2-digit'}).format(new Date(attendanceMap.get(`${employee.id}|${attendanceDate}`)!.check_in_at!))}`
                          : ''}
                      </small>}
                  </td>
                  <td><div className="attendance-actions">
                    {(['present','permission','sick','absent'] as AttendanceStatus[]).map(status=>
                      <button
                        type="button"
                        key={status}
                        className={`${current===status?'active ':''}attendance-${status}`}
                        disabled={busy}
                        onClick={()=>setAttendanceStatus(employee,status)}
                      >{statusLabels[status]}</button>
                    )}
                  </div></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>:<>
      <section className="stats-grid payroll-stats">
        <StatCard icon={HandCoins} label="Omzet Bulan" value={formatRupiah(monthlyRevenue)} caption="Pembayaran aktual"/>
        <StatCard icon={WalletCards} label="Gaji Bersih" value={formatRupiah(totalPayroll)} caption={`${employees.length} karyawan aktif`}/>
        <StatCard icon={HandCoins} label="Kas Bon Dipotong" value={formatRupiah(totalCashAdvanceApplied)} caption={`Sisa kas bon ${formatRupiah(totalCashAdvanceOutstanding)}`}/>
        <StatCard icon={Gift} label="Komisi Order" value={formatRupiah(totalOrderCommission)} caption="Produksi + kurir yang sudah menjadi hak"/>
        <StatCard icon={CheckCircle2} label="Gaji Dibayar" value={formatRupiah(totalPaidPayroll)} caption={`Sisa ${formatRupiah(totalOutstandingPayroll)}`}/>
      </section>

      <section className="panel payroll-formula">
        <HandCoins size={21}/>
        <div><b>Rumus Gaji</b><span>Gaji Bersih = Uang Kehadiran + Tunjangan + Bonus + Bagi Hasil Kategori + Komisi Order − Kas Bon. Sisa kas bon otomatis tetap tersimpan untuk periode berikutnya.</span></div>
      </section>

      <section className="panel data-panel payroll-list-panel">
        <div className="payroll-table-head payroll-list-fixed-head">
          <div><b>Daftar Gaji — {new Date(`${month}-01T00:00:00`).toLocaleDateString('id-ID',{month:'long',year:'numeric'})}</b><small>Komisi per order otomatis terakumulasi sesuai karyawan produksi dan kurir yang dipilih saat transaksi.</small></div>
          <button className="primary-button" onClick={()=>void saveBonuses()} disabled={busy}><Save size={16}/>{busy?'Menyimpan...':'Simpan Bonus'}</button>
        </div>
        <div className="table-wrap payroll-list-scroll">
          <table className="payroll-table">
            <thead><tr>
              <th>Karyawan</th><th>Hadir</th><th>Tarif/Hari</th><th>Uang Hadir</th>
              <th>Tunjangan</th><th>Bonus</th><th>Bagi Hasil Kategori</th><th>Komisi Order</th><th>Gaji Kotor</th><th>Kas Bon</th><th>Gaji Bersih</th><th>Dibayar</th><th>Sisa</th><th>Status</th><th>Aksi</th>
            </tr></thead>
            <tbody>
              {filteredPayroll.map(r=><tr key={r.employee.id}>
                <td><b>{r.employee.full_name}</b><small>{r.employee.login_id}</small></td>
                <td><b>{r.presentDays}</b><small>Izin {r.permissionDays} • Sakit {r.sickDays} • Alpha {r.absentDays}</small></td>
                <td>{formatRupiah(r.attendanceRate)}</td>
                <td><b>{formatRupiah(r.attendancePay)}</b></td>
                <td>{formatRupiah(r.allowance)}</td>
                <td><input className="payroll-bonus-input" type="number" min="0" value={bonusDraft[r.employee.id]??String(r.bonus)} onChange={e=>setBonusDraft({...bonusDraft,[r.employee.id]:e.target.value})}/></td>
                <td>
                  <b>{formatRupiah(r.revenueShare)}</b>
                  {r.shareDetails.length
                    ? <div className="payroll-share-lines">
                        {r.shareDetails.map(item=><small key={item.category}>
                          {item.category}: {item.percent.toFixed(2)}% × {formatRupiah(item.baseRevenue)} = {formatRupiah(item.amount)}
                        </small>)}
                      </div>
                    : <small>Belum ada kategori bagi hasil</small>}
                </td>
                <td>
                  <b>{formatRupiah(r.orderCommission)}</b>
                  <div className="payroll-share-lines">
                    <small>Produksi: {formatRupiah(r.productionCommission)}</small>
                    <small>Kurir: {formatRupiah(r.courierCommission)}</small>
                    <small>{r.commissionOrderCount} order</small>
                  </div>
                </td>
                <td><b>{formatRupiah(r.grossTotal)}</b></td>
                <td><b className="payroll-deduction">− {formatRupiah(r.cashAdvanceApplied)}</b><small>Sisa {formatRupiah(r.cashAdvanceOutstanding)}</small></td>
                <td><b className={`payroll-total ${r.payrollBalance<0?'negative':''}`}>{formatRupiah(r.payrollBalance)}</b></td>
                <td><b>{formatRupiah(r.paidAmount)}</b></td>
                <td><b className={r.outstanding>0?'payroll-outstanding':'payroll-paid'}>{formatRupiah(r.outstanding)}</b></td>
                <td><span className={`payroll-payment-status ${r.payrollBalance<0?'debt':r.paymentStatus}`}>{r.payrollBalance<0?'Saldo Minus':r.paymentStatus==='cashbon'?'Terpotong Kas Bon':r.paymentStatus==='nil'?'Nihil':r.paymentStatus==='paid'?'Lunas':r.paymentStatus==='partial'?'Sebagian':'Belum Dibayar'}</span></td>
                <td>
                  <div className="payroll-row-actions">
                    <button className="finance-row-action" onClick={()=>setDetailEmployee(r.employee)}><ReceiptText size={15}/>Detail</button>
                    <button className="finance-row-action cash-advance-button" onClick={()=>openCashAdvance(r.employee)}><HandCoins size={15}/>Kas Bon</button>
                    {r.cashAdvanceOutstanding>0&&<button className="finance-row-action cash-advance-deduct-button" onClick={()=>openCashAdvanceDeduction(r.employee)}><HandCoins size={15}/>Potong Kas Bon</button>}
                    {r.outstanding>0&&<button className="finance-row-action payroll-pay-button" onClick={()=>openPayrollPayment(r.employee)}><HandCoins size={15}/>Bayar</button>}
                    <button className="finance-row-action" onClick={()=>openSettings(r.employee)}><Settings2 size={15}/>Atur</button>
                  </div>
                </td>
              </tr>)}
              {filteredPayroll.length===0&&<tr><td colSpan={15} className="table-empty">Belum ada karyawan aktif.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>}

    {detailEmployee&&(()=>{
      const row=payrollRows.find(item=>item.employee.id===detailEmployee.id)
      const details=row?.commissionDetails||[]
      const cashHistory=cashAdvances.filter(item=>item.employee_id===detailEmployee.id)
      return <Modal title={`Detail Gaji & Komisi — ${detailEmployee.full_name}`} onClose={()=>setDetailEmployee(null)}>
        <div className="payroll-detail-summary">
          <div><span>Total Komisi Order</span><b>{formatRupiah(row?.orderCommission||0)}</b></div>
          <div><span>Produksi</span><b>{formatRupiah(row?.productionCommission||0)}</b></div>
          <div><span>Kurir</span><b>{formatRupiah(row?.courierCommission||0)}</b></div>
          <div><span>Gaji Kotor</span><b>{formatRupiah(row?.grossTotal||0)}</b></div>
          <div><span>Potongan Kas Bon</span><b>− {formatRupiah(row?.cashAdvanceApplied||0)}</b></div>
          <div><span>Sisa Kas Bon</span><b>{formatRupiah(row?.cashAdvanceOutstanding||0)}</b></div>
          <div><span>Saldo Gaji Setelah Kas Bon</span><b className={(row?.payrollBalance||0)<0?'payroll-negative':''}>{formatRupiah(row?.payrollBalance||0)}</b></div>
          <div><span>Sudah Dibayar</span><b>{formatRupiah(row?.paidAmount||0)}</b></div>
          <div><span>Sisa Gaji</span><b>{formatRupiah(row?.outstanding||0)}</b></div>
        </div>
        <div className="payroll-detail-head">
          <b>Sumber Komisi dari Order</b>
          <small>Gunakan rincian ini untuk pengecekan jika ada komplain pekerjaan atau komisi karyawan.</small>
        </div>
        <div className="table-wrap payroll-commission-detail-wrap">
          <table className="payroll-commission-detail">
            <thead><tr><th>Order</th><th>Peran</th><th>Nilai Order</th><th>%</th><th>Komisi</th><th>Tanggal Hak</th></tr></thead>
            <tbody>
              {details.map((item,index)=><tr key={`${item.order_id}-${item.commission_type}-${index}`}>
                <td><b>{item.order_no}</b></td>
                <td>{item.commission_type==='production'?'Produksi':'Kurir'}</td>
                <td>{formatRupiah(Number(item.base_amount||0))}</td>
                <td>{Number(item.percent||0).toFixed(2)}%</td>
                <td><b>{formatRupiah(Number(item.amount||0))}</b></td>
                <td>{new Date(item.earned_at).toLocaleString('id-ID')}</td>
              </tr>)}
              {details.length===0&&<tr><td colSpan={6} className="table-empty">Belum ada komisi order pada periode ini.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="payroll-detail-head payroll-payment-history-head">
          <b>Riwayat Kas Bon</b>
          <small>Kas bon yang belum habis dipotong akan tersimpan sebagai saldo untuk periode berikutnya.</small>
        </div>
        <div className="table-wrap payroll-payment-history-wrap">
          <table className="payroll-commission-detail">
            <thead><tr><th>Tanggal</th><th>Nominal</th><th>Sisa</th><th>Status</th><th>Keterangan</th><th>Aksi</th></tr></thead>
            <tbody>
              {cashHistory.map(item=><tr key={item.id} className={item.cancelled_at?'cash-advance-cancelled':''}>
                <td>{new Date(item.issued_at).toLocaleString('id-ID')}</td>
                <td><b>{formatRupiah(Number(item.amount||0))}</b></td>
                <td>{item.cancelled_at?'-':formatRupiah(Number(item.remaining_amount||0))}</td>
                <td><span className={`cash-advance-status ${item.cancelled_at?'cancelled':'active'}`}>{item.cancelled_at?'Dibatalkan':'Aktif'}</span></td>
                <td>{item.cancelled_at?`Batal: ${item.cancel_reason||'-'}`:(item.note||'-')}</td>
                <td>{!item.cancelled_at&&<div className="cash-advance-history-actions">
                  <button className="finance-row-action" onClick={()=>openCorrectCashAdvance(item)}><Pencil size={14}/>Koreksi</button>
                  <button className="finance-row-action danger-soft" onClick={()=>{setCancelCashAdvance(item);setCancelCashAdvanceReason('')}}><Trash2 size={14}/>Batalkan</button>
                </div>}</td>
              </tr>)}
              {cashHistory.length===0&&<tr><td colSpan={6} className="table-empty">Belum ada kas bon.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="payroll-detail-head payroll-payment-history-head">
          <b>Riwayat Pembayaran Gaji</b>
          <small>Catatan pembayaran tersimpan per periode untuk mencegah pembayaran dobel.</small>
        </div>
        <div className="table-wrap payroll-payment-history-wrap">
          <table className="payroll-commission-detail">
            <thead><tr><th>Tanggal</th><th>Metode</th><th>Nominal</th><th>Catatan</th></tr></thead>
            <tbody>
              {(row?.paymentHistory||[]).map(payment=><tr key={payment.id}>
                <td>{new Date(payment.paid_at).toLocaleString('id-ID')}</td>
                <td>{payment.payment_method}</td>
                <td><b>{formatRupiah(Number(payment.amount||0))}</b></td>
                <td>{payment.note||'-'}</td>
              </tr>)}
              {(row?.paymentHistory||[]).length===0&&<tr><td colSpan={4} className="table-empty">Belum ada pembayaran gaji pada periode ini.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          {(row?.outstanding||0)>0&&<button className="primary-button" onClick={()=>{setDetailEmployee(null);openPayrollPayment(detailEmployee)}}><HandCoins size={16}/>Catat Pembayaran</button>}
          <button className="secondary-button" onClick={()=>downloadXls(commissionDetailExport(detailEmployee))}><FileSpreadsheet size={16}/>Export XLS</button>
          <button className="secondary-button" onClick={()=>printPdf(commissionDetailExport(detailEmployee))}><FileText size={16}/>Cetak / PDF</button>
          <button className="secondary-button" onClick={()=>setDetailEmployee(null)}>Tutup</button>
        </div>
      </Modal>
    })()}

    {deductCashAdvanceEmployee&&(()=>{
      const row=payrollRows.find(item=>item.employee.id===deductCashAdvanceEmployee.id)
      const availableSalary=Math.max(0,Number(row?.grossTotal||0)-Number(row?.cashAdvanceApplied||0))
      const outstandingCashAdvance=Math.max(0,Number(row?.cashAdvanceOutstanding||0))
      const maxAmount=Math.min(availableSalary,outstandingCashAdvance)
      return <Modal title={`Potong Kas Bon dari Gaji — ${deductCashAdvanceEmployee.full_name}`} onClose={()=>!busy&&setDeductCashAdvanceEmployee(null)}>
        <form className="modal-form" onSubmit={saveCashAdvanceDeduction}>
          <div className="payroll-payment-card">
            <div><span>Sisa Kas Bon</span><b>{formatRupiah(outstandingCashAdvance)}</b></div>
            <div><span>Gaji Tersedia untuk Potongan</span><b>{formatRupiah(availableSalary)}</b></div>
            <div><span>Maksimal Potongan</span><b>{formatRupiah(maxAmount)}</b></div>
          </div>
          <label>Nominal Potongan
            <input type="number" min="1" max={Math.max(0,Math.floor(maxAmount))} value={cashAdvanceDeductionAmount} onChange={e=>setCashAdvanceDeductionAmount(e.target.value)} required/>
          </label>
          <div className="info-box">Potongan gaji mengurangi saldo kas bon. Tidak dibuat transaksi Kas Masuk karena tidak ada uang baru yang diterima perusahaan.</div>
          {message&&<div className="error-box">{message}</div>}
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={()=>setDeductCashAdvanceEmployee(null)} disabled={busy}>Batal</button>
            <button className="primary-button" disabled={busy||Number(cashAdvanceDeductionAmount)<=0||maxAmount<=0}><HandCoins size={16}/>{busy?'Memproses...':'Potong dari Gaji'}</button>
          </div>
        </form>
      </Modal>
    })()}

    {correctCashAdvance&&(()=>{
      const alreadyDeducted=Math.max(0,Number(correctCashAdvance.amount||0)-Number(correctCashAdvance.remaining_amount||0))
      const newAmount=Math.max(0,Number(correctCashAdvanceForm.amount)||0)
      const newRemaining=Math.max(0,newAmount-alreadyDeducted)
      return <Modal title="Koreksi Kas Bon — Owner" onClose={()=>!busy&&setCorrectCashAdvance(null)}>
        <form className="modal-form" onSubmit={saveCorrectCashAdvance}>
          <div className="payroll-payment-card">
            <div><span>Nominal Sebelumnya</span><b>{formatRupiah(Number(correctCashAdvance.amount||0))}</b></div>
            <div><span>Sudah Dipotong dari Gaji</span><b>{formatRupiah(alreadyDeducted)}</b></div>
            <div><span>Sisa Setelah Koreksi</span><b>{formatRupiah(newRemaining)}</b></div>
          </div>
          <label>Nominal Kas Bon yang Benar
            <input
              type="number"
              min={Math.max(1,Math.ceil(alreadyDeducted))}
              value={correctCashAdvanceForm.amount}
              onChange={e=>setCorrectCashAdvanceForm({...correctCashAdvanceForm,amount:e.target.value})}
              required
            />
          </label>
          <label>Keterangan
            <textarea
              rows={3}
              value={correctCashAdvanceForm.note}
              onChange={e=>setCorrectCashAdvanceForm({...correctCashAdvanceForm,note:e.target.value})}
              placeholder="Keterangan kas bon"
            />
          </label>
          <label>Alasan Koreksi
            <textarea
              rows={3}
              value={correctCashAdvanceForm.reason}
              onChange={e=>setCorrectCashAdvanceForm({...correctCashAdvanceForm,reason:e.target.value})}
              placeholder="Contoh: salah input nominal kas bon"
              required
            />
          </label>
          <div className="info-box">
            Nominal tidak boleh lebih kecil dari kas bon yang sudah pernah dipotong dari gaji. Perubahan nominal akan tercatat di audit dan penyesuaian kas.
          </div>
          {message&&<div className="error-box">{message}</div>}
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={()=>setCorrectCashAdvance(null)} disabled={busy}>Batal</button>
            <button className="primary-button" disabled={busy||newAmount<=0||correctCashAdvanceForm.reason.trim().length<5}>
              <Pencil size={16}/>{busy?'Menyimpan...':'Simpan Koreksi'}
            </button>
          </div>
        </form>
      </Modal>
    })()}

    {cancelCashAdvance&&<Modal title="Batalkan Kas Bon" onClose={()=>!busy&&setCancelCashAdvance(null)}>
      <form className="modal-form" onSubmit={confirmCancelCashAdvance}>
        <div className="payroll-setting-note"><Trash2 size={18}/><div><b>Kas Bon {formatRupiah(Number(cancelCashAdvance.amount||0))}</b><span>Pembatalan tidak menghapus riwayat. Jika potongan gaji belum dibayar, potongan akan dikembalikan otomatis.</span></div></div>
        <label>Alasan Pembatalan
          <textarea rows={3} value={cancelCashAdvanceReason} onChange={e=>setCancelCashAdvanceReason(e.target.value)} placeholder="Contoh: salah input nominal / kas bon dibatalkan"/>
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={()=>setCancelCashAdvance(null)} disabled={busy}>Batal</button>
          <button className="danger-button" disabled={busy||!cancelCashAdvanceReason.trim()}><Trash2 size={16}/>{busy?'Memproses...':'Batalkan Kas Bon'}</button>
        </div>
      </form>
    </Modal>}

    {cashAdvanceEmployee&&(()=>{
      const row=payrollRows.find(item=>item.employee.id===cashAdvanceEmployee.id)
      return <Modal title={`Kas Bon — ${cashAdvanceEmployee.full_name}`} onClose={()=>!busy&&setCashAdvanceEmployee(null)}>
        <form className="modal-form" onSubmit={saveCashAdvance}>
          <div className="payroll-payment-card">
            <div><span>Gaji Kotor Periode Ini</span><b>{formatRupiah(row?.grossTotal||0)}</b></div>
            <div><span>Kas Bon Sudah Dipotong</span><b>{formatRupiah(row?.cashAdvanceApplied||0)}</b></div>
            <div><span>Sisa Kas Bon Lama</span><b>{formatRupiah(row?.cashAdvanceOutstanding||0)}</b></div>
          </div>
          <label>Nominal Kas Bon
            <input type="number" min="1" value={cashAdvanceForm.amount} onChange={e=>setCashAdvanceForm({...cashAdvanceForm,amount:e.target.value})} placeholder="Contoh: 200000"/>
          </label>
          <label>Keterangan
            <textarea rows={3} value={cashAdvanceForm.note} onChange={e=>setCashAdvanceForm({...cashAdvanceForm,note:e.target.value})} placeholder="Contoh: Kas bon kebutuhan keluarga"/>
          </label>
          <div className="info-box">Kas bon akan langsung dipotong dari gaji periode ini sebesar hak gaji yang tersedia. Jika kas bon lebih besar dari gaji, sisanya otomatis dibawa ke periode berikutnya.</div>
          {message&&<div className="error-box">{message}</div>}
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={()=>setCashAdvanceEmployee(null)} disabled={busy}>Batal</button>
            <button className="primary-button" disabled={busy||Number(cashAdvanceForm.amount)<=0}><Save size={16}/>{busy?'Menyimpan...':'Simpan Kas Bon'}</button>
          </div>
        </form>
      </Modal>
    })()}

    {paymentEmployee&&(()=>{
      const row=payrollRows.find(item=>item.employee.id===paymentEmployee.id)
      return <Modal title={`Pembayaran Gaji — ${paymentEmployee.full_name}`} onClose={()=>!busy&&setPaymentEmployee(null)}>
        <form className="modal-form" onSubmit={savePayrollPayment}>
          <div className="payroll-payment-card">
            <div><span>Saldo Gaji Setelah Kas Bon</span><b className={(row?.payrollBalance||0)<0?'payroll-negative':''}>{formatRupiah(row?.payrollBalance||0)}</b></div>
            <div><span>Sudah Dibayar</span><b>{formatRupiah(row?.paidAmount||0)}</b></div>
            <div><span>Sisa</span><b>{formatRupiah(row?.outstanding||0)}</b></div>
          </div>
          <label>Nominal Pembayaran
            <input type="number" min="1" max={Math.max(0,Math.floor(Number(row?.outstanding||0)))} value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm,amount:e.target.value})}/>
          </label>
          <label>Metode Pembayaran
            <select value={paymentForm.payment_method} onChange={e=>setPaymentForm({...paymentForm,payment_method:e.target.value})}>
              <option>Transfer</option><option>Tunai</option><option>QRIS</option><option>Lainnya</option>
            </select>
          </label>
          <label>Catatan
            <textarea rows={3} value={paymentForm.note} onChange={e=>setPaymentForm({...paymentForm,note:e.target.value})} placeholder="Opsional, contoh: Transfer BCA 13 Agustus"/>
          </label>
          {message&&<div className="error-box">{message}</div>}
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={()=>setPaymentEmployee(null)} disabled={busy}>Batal</button>
            <button className="primary-button" disabled={busy||Number(paymentForm.amount)<=0}><Save size={16}/>{busy?'Menyimpan...':'Catat Pembayaran'}</button>
          </div>
        </form>
      </Modal>
    })()}

    {overrideTarget&&<Modal
      title={`Ubah Absensi — ${overrideTarget.employee.full_name}`}
      onClose={()=>!busy&&setOverrideTarget(null)}
    >
      <form className="modal-form" onSubmit={saveAttendanceOverride}>
        <div className="attendance-override-card">
          <CalendarCheck2 size={22}/>
          <div>
            <b>Status: {statusLabels[overrideTarget.status]}</b>
            <span>{new Intl.DateTimeFormat('id-ID',{timeZone:BUSINESS_TIME_ZONE,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${attendanceDate}T12:00:00+07:00`))}</span>
          </div>
        </div>

        {overrideTarget.status==='present'&&<div className="attendance-override-info">
          Gunakan Hadir Manual jika karyawan memang hadir tetapi gagal absen otomatis karena koneksi, GPS, kamera, atau QR.
        </div>}

        <label>Alasan / Catatan Owner
          <textarea
            rows={3}
            value={overrideReason}
            onChange={e=>setOverrideReason(e.target.value)}
            placeholder="Contoh: Karyawan hadir, internet toko mati saat jam masuk."
            autoFocus
          />
        </label>

        {message&&<div className="error-box">{message}</div>}

        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={()=>setOverrideTarget(null)} disabled={busy}>Batal</button>
          <button className="primary-button" disabled={busy||!overrideReason.trim()}>
            <Save size={16}/>{busy?'Menyimpan...':'Simpan Absensi Manual'}
          </button>
        </div>
      </form>
    </Modal>}

    {settingsEmployee&&<Modal title={`Komponen Gaji — ${settingsEmployee.full_name}`} onClose={()=>setSettingsEmployee(null)}>
      <form className="modal-form" onSubmit={saveSettings}>
        <div className="payroll-setting-note">
          <HandCoins size={20}/>
          <div><b>Pengaturan gaji tetap</b><span>Bonus diisi per bulan langsung dari tabel gaji.</span></div>
        </div>
        <label>Uang Kehadiran per Hari
          <input type="number" min="0" value={settingForm.attendance_rate} onChange={e=>setSettingForm({...settingForm,attendance_rate:e.target.value})}/>
        </label>
        <label>Tunjangan Bulanan
          <input type="number" min="0" value={settingForm.monthly_allowance} onChange={e=>setSettingForm({...settingForm,monthly_allowance:e.target.value})}/>
        </label>
        <div className="multi-share-section">
          <div className="multi-share-heading">
            <div>
              <b>Komisi per Order</b>
              <small>Persentase ini otomatis di-snapshot ke nota/order saat karyawan atau kurir dipilih di Kasir.</small>
            </div>
          </div>
          <div className="form-grid-two">
            <label>Komisi Produksi (%)
              <input type="number" min="0" max="100" step="0.01" value={settingForm.production_percent} onChange={e=>setSettingForm({...settingForm,production_percent:e.target.value})}/>
            </label>
            <label>Komisi Kurir (%)
              <input type="number" min="0" max="100" step="0.01" value={settingForm.courier_percent} onChange={e=>setSettingForm({...settingForm,courier_percent:e.target.value})}/>
            </label>
          </div>
        </div>
        <div className="multi-share-section">
          <div className="multi-share-heading">
            <div>
              <b>Bagi Hasil per Kategori Layanan</b>
              <small>Satu karyawan bisa memiliki lebih dari satu kategori dengan persentase berbeda.</small>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={()=>setShareDraft([...shareDraft,{category:serviceCategories.find(category=>!shareDraft.some(item=>item.category===category))||'Kiloan',share_percent:'0'}])}
              disabled={shareDraft.length>=serviceCategories.length}
            >
              <Plus size={15}/>Tambah Kategori
            </button>
          </div>

          <div className="multi-share-list">
            {shareDraft.map((item,index)=>{
              const baseRevenue=Number(categoryRevenue[item.category]||0)
              const percent=Math.max(0,Number(item.share_percent)||0)
              const amount=baseRevenue*(percent/100)
              return <div className="multi-share-row" key={`${item.category}-${index}`}>
                <label>Kategori
                  <select
                    value={item.category}
                    onChange={e=>{
                      const next=[...shareDraft]
                      next[index]={...next[index],category:e.target.value}
                      setShareDraft(next)
                    }}
                  >
                    {serviceCategories.map(category=><option
                      key={category}
                      value={category}
                      disabled={shareDraft.some((x,i)=>i!==index&&x.category===category)}
                    >{category}</option>)}
                  </select>
                </label>

                <label>Persentase (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={item.share_percent}
                    onChange={e=>{
                      const next=[...shareDraft]
                      next[index]={...next[index],share_percent:e.target.value}
                      setShareDraft(next)
                    }}
                  />
                </label>

                <div className="multi-share-result">
                  <span>Omzet kategori</span>
                  <b>{formatRupiah(baseRevenue)}</b>
                  <span>Bagi hasil</span>
                  <b>{formatRupiah(amount)}</b>
                </div>

                <button
                  type="button"
                  className="icon-button multi-share-remove"
                  title="Hapus kategori"
                  onClick={()=>setShareDraft(shareDraft.filter((_,i)=>i!==index))}
                >
                  <Trash2 size={16}/>
                </button>
              </div>
            })}
          </div>

          <div className="multi-share-total">
            <span>Total perkiraan bagi hasil</span>
            <b>{formatRupiah(shareDraft.reduce((sum,item)=>{
              const base=Number(categoryRevenue[item.category]||0)
              const percent=Math.max(0,Number(item.share_percent)||0)
              return sum+(base*(percent/100))
            },0))}</b>
          </div>
        </div>
        {message&&<div className="error-box">{message}</div>}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={()=>setSettingsEmployee(null)}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy?'Menyimpan...':'Simpan Komponen Gaji'}</button>
        </div>
      </form>
    </Modal>}
  </>
}
