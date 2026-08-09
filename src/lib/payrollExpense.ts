import { supabase } from './supabase'

export interface PayrollExpenseRow{
  id:string
  expense_date:string
  category_id:null
  category_name:string
  group_name:string
  amount:number
  payment_method:string
  description:string
  reference:string
  created_at:string
  payroll_month:string
  employee_id:string
  employee_name:string
  present_days:number
  attendance_pay:number
  allowance:number
  bonus:number
  revenue_share:number
}

interface Employee{ id:string; full_name:string }
interface Attendance{ employee_id:string; attendance_date:string; status:string }
interface PayrollSetting{ employee_id:string; attendance_rate:number; monthly_allowance:number }
interface PayrollShare{ employee_id:string; category:string; share_percent:number }
interface PayrollAdjustment{ employee_id:string; payroll_month:string; bonus:number }
interface Payment{ order_id:string; amount:number; created_at:string }
interface OrderItem{ order_id:string; service_id:string|null; subtotal:number }
interface Service{ id:string; category:string }

const pad=(n:number)=>String(n).padStart(2,'0')
const monthStartKey=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-01`
const dateKey=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const inMonth=(value:string,d:Date)=>{
  const x=new Date(value)
  return x.getFullYear()===d.getFullYear()&&x.getMonth()===d.getMonth()
}
const monthList=(from:string,to:string)=>{
  const a=new Date(`${from}T12:00:00`)
  const b=new Date(`${to}T12:00:00`)
  const cursor=new Date(a.getFullYear(),a.getMonth(),1)
  const end=new Date(b.getFullYear(),b.getMonth(),1)
  const result:Date[]=[]
  while(cursor<=end){
    result.push(new Date(cursor))
    cursor.setMonth(cursor.getMonth()+1)
  }
  return result
}

export async function loadPayrollExpenseRows(from:string,to:string):Promise<PayrollExpenseRow[]>{
  const months=monthList(from,to)
  if(months.length===0)return[]

  const firstMonth=monthStartKey(months[0])
  const last=months[months.length-1]
  const lastDay=new Date(last.getFullYear(),last.getMonth()+1,0)
  const lastDate=dateKey(lastDay)

  const [emp,a,ps,shr,adj,p,oi,sv]=await Promise.all([
    supabase.from('v109_users').select('id,full_name').eq('is_active',true).order('full_name'),
    supabase.from('v111_attendance').select('employee_id,attendance_date,status').gte('attendance_date',firstMonth).lte('attendance_date',lastDate),
    supabase.from('v111_employee_payroll_settings').select('employee_id,attendance_rate,monthly_allowance'),
    supabase.from('v111_employee_revenue_shares').select('employee_id,category,share_percent'),
    supabase.from('v111_payroll_adjustments').select('employee_id,payroll_month,bonus').gte('payroll_month',firstMonth).lte('payroll_month',monthStartKey(last)),
    supabase.from('v100_payments').select('order_id,amount,created_at').gte('created_at',`${firstMonth}T00:00:00`).lte('created_at',`${lastDate}T23:59:59.999`),
    supabase.from('v100_order_items').select('order_id,service_id,subtotal'),
    supabase.from('v100_services').select('id,category')
  ])

  const error=emp.error||a.error||ps.error||shr.error||adj.error||p.error||oi.error||sv.error
  if(error)throw error

  const employees=(emp.data as Employee[])||[]
  const attendance=(a.data as Attendance[])||[]
  const settings=(ps.data as PayrollSetting[])||[]
  const shares=(shr.data as PayrollShare[])||[]
  const adjustments=(adj.data as PayrollAdjustment[])||[]
  const payments=(p.data as Payment[])||[]
  const orderItems=(oi.data as OrderItem[])||[]
  const services=(sv.data as Service[])||[]

  const settingMap=new Map(settings.map(row=>[row.employee_id,row]))
  const serviceCategory=new Map(services.map(service=>[
    service.id,(service.category||'Kiloan').trim()||'Kiloan'
  ]))
  const itemsByOrder=new Map<string,OrderItem[]>()
  for(const item of orderItems){
    const list=itemsByOrder.get(item.order_id)||[]
    list.push(item);itemsByOrder.set(item.order_id,list)
  }
  const sharesByEmployee=new Map<string,PayrollShare[]>()
  for(const share of shares){
    const list=sharesByEmployee.get(share.employee_id)||[]
    list.push(share);sharesByEmployee.set(share.employee_id,list)
  }

  const result:PayrollExpenseRow[]=[]

  for(const month of months){
    const mStart=monthStartKey(month)
    const monthPayments=payments.filter(row=>inMonth(row.created_at,month))
    const categoryRevenue:Record<string,number>={}

    for(const payment of monthPayments){
      const list=itemsByOrder.get(payment.order_id)||[]
      const itemTotal=list.reduce((sum,item)=>sum+Math.max(0,Number(item.subtotal||0)),0)
      const paymentAmount=Math.max(0,Number(payment.amount||0))
      if(paymentAmount<=0)continue
      if(list.length===0||itemTotal<=0){
        categoryRevenue.Kiloan=(categoryRevenue.Kiloan||0)+paymentAmount
        continue
      }
      for(const item of list){
        const subtotal=Math.max(0,Number(item.subtotal||0))
        if(subtotal<=0)continue
        const category=item.service_id?serviceCategory.get(item.service_id)||'Kiloan':'Kiloan'
        categoryRevenue[category]=(categoryRevenue[category]||0)+paymentAmount*(subtotal/itemTotal)
      }
    }

    const adjustmentMap=new Map(
      adjustments.filter(row=>row.payroll_month===mStart).map(row=>[row.employee_id,row])
    )

    for(const employee of employees){
      const setting=settingMap.get(employee.id)
      const presentDays=attendance.filter(row=>
        row.employee_id===employee.id&&row.status==='present'&&inMonth(`${row.attendance_date}T12:00:00`,month)
      ).length
      const attendancePay=presentDays*Number(setting?.attendance_rate||0)
      const allowance=Number(setting?.monthly_allowance||0)
      const bonus=Number(adjustmentMap.get(employee.id)?.bonus||0)
      const revenueShare=(sharesByEmployee.get(employee.id)||[]).reduce((sum,share)=>
        sum+Number(categoryRevenue[share.category]||0)*(Number(share.share_percent||0)/100),0
      )
      const amount=attendancePay+allowance+bonus+revenueShare
      if(amount<=0)continue

      result.push({
        id:`payroll:${mStart}:${employee.id}`,
        expense_date:mStart,
        category_id:null,
        category_name:'Gaji Karyawan',
        group_name:'SDM / Payroll',
        amount,
        payment_method:'payroll',
        description:`${employee.full_name} • Hadir ${presentDays} hari • Uang hadir ${attendancePay.toLocaleString('id-ID')} • Tunjangan ${allowance.toLocaleString('id-ID')} • Bonus ${bonus.toLocaleString('id-ID')} • Bagi hasil ${Math.round(revenueShare).toLocaleString('id-ID')}`,
        reference:`PAYROLL-${mStart.slice(0,7)}-${employee.id.slice(0,8)}`,
        created_at:`${mStart}T12:00:00`,
        payroll_month:mStart,
        employee_id:employee.id,
        employee_name:employee.full_name,
        present_days:presentDays,
        attendance_pay:attendancePay,
        allowance,
        bonus,
        revenue_share:revenueShare
      })
    }
  }

  return result
}
