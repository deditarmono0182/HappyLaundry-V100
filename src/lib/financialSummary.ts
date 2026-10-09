import { supabase } from './supabase'
import { businessDateTimeIso } from './businessTime'

type ExpenseRow={
  expense_date:string
  category_name:string
  group_name:string|null
  amount:number
}
type AttendanceRow={employee_id:string;attendance_date:string;status:string}
type PayrollSetting={employee_id:string;attendance_rate:number;monthly_allowance:number}
type PayrollAdjustment={employee_id:string;payroll_month:string;bonus:number}
type EmployeeShare={employee_id:string;category:string;share_percent:number}
type CommissionRow={employee_id:string;commission_type:'production'|'courier';amount:number;earned_at:string}
type OrderRow={id:string;total:number;paid_amount:number;status:string;created_at:string}
type PaymentRow={amount:number;created_at:string}
type OrderItem={order_id:string;service_id:string|null;subtotal:number}
type ServiceRow={id:string;category:string|null}
type ReserveSetting={
  reserve_type:string
  method:'fixed'|'percent_revenue'
  monthly_amount:number
  revenue_percent:number
  is_active:boolean
}

export type FinancialSummary={
  revenue:number
  cashIn:number
  receivable:number
  operating:number
  attendancePay:number
  allowance:number
  bonus:number
  revenueShare:number
  productionCommission:number
  courierCommission:number
  employeeCost:number
  operatingNet:number
  reserveTotal:number
  netAfterReserve:number
  cashOperatingSurplus:number
}

const pad=(n:number)=>String(n).padStart(2,'0')
const daysInMonth=(year:number,month:number)=>new Date(Date.UTC(year,month,0)).getUTCDate()

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

export async function fetchFinancialSummary(from:string,to:string):Promise<FinancialSummary>{
  const fromISO=businessDateTimeIso(from)
  const toISO=businessDateTimeIso(to,'23:59:59.999')
  const firstMonth=`${from.slice(0,7)}-01`
  const lastMonth=`${to.slice(0,7)}-01`

  const [o,p,e,a,ps,adj,shr,com,it,sv,res]=await Promise.all([
    supabase.from('v100_orders_view')
      .select('id,total,paid_amount,status,created_at')
      .gte('created_at',fromISO).lte('created_at',toISO),
    supabase.from('v100_payments')
      .select('amount,created_at')
      .gte('created_at',fromISO).lte('created_at',toISO),
    supabase.from('v106_expenses_view')
      .select('expense_date,category_name,group_name,amount')
      .gte('expense_date',from).lte('expense_date',to),
    supabase.from('v111_attendance')
      .select('employee_id,attendance_date,status')
      .gte('attendance_date',from).lte('attendance_date',to),
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
    supabase.from('v100_order_items').select('order_id,service_id,subtotal'),
    supabase.from('v100_services').select('id,category'),
    supabase.from('v113095_reserve_settings')
      .select('reserve_type,method,monthly_amount,revenue_percent,is_active')
  ])

  const error=o.error||p.error||e.error||a.error||ps.error||adj.error||shr.error||com.error||it.error||sv.error||res.error
  if(error)throw error

  const orders=(o.data as OrderRow[])||[]
  const payments=(p.data as PaymentRow[])||[]
  const expenses=(e.data as ExpenseRow[])||[]
  const attendance=(a.data as AttendanceRow[])||[]
  const settings=(ps.data as PayrollSetting[])||[]
  const adjustments=(adj.data as PayrollAdjustment[])||[]
  const shares=(shr.data as EmployeeShare[])||[]
  const commissions=(com.data as CommissionRow[])||[]
  const items=(it.data as OrderItem[])||[]
  const services=(sv.data as ServiceRow[])||[]
  const reserves=(res.data as ReserveSetting[])||[]

  const validOrders=orders.filter(row=>row.status!=='cancelled')
  const revenue=validOrders.reduce((sum,row)=>sum+Math.max(0,Number(row.total||0)),0)
  const cashIn=payments.reduce((sum,row)=>sum+Number(row.amount||0),0)
  const receivable=validOrders.reduce((sum,row)=>sum+Math.max(0,Number(row.total||0)-Number(row.paid_amount||0)),0)

  const operating=expenses
    .filter(row=>!isPayrollLikeExpense(row))
    .reduce((sum,row)=>sum+Number(row.amount||0),0)

  const settingMap=new Map(settings.map(row=>[row.employee_id,row]))
  const attendanceDays=new Map<string,number>()
  for(const row of attendance){
    if(row.status!=='present')continue
    attendanceDays.set(row.employee_id,(attendanceDays.get(row.employee_id)||0)+1)
  }
  const attendancePay=Array.from(attendanceDays.entries()).reduce((sum,[employeeId,days])=>{
    return sum+days*Number(settingMap.get(employeeId)?.attendance_rate||0)
  },0)

  const monthDays=rangeDaysByMonth(from,to)
  let allowance=0
  let bonus=0
  for(const [monthKey,selectedDays] of monthDays.entries()){
    const [year,month]=monthKey.split('-').map(Number)
    const totalDays=daysInMonth(year,month)
    for(const setting of settings){
      allowance+=Number(setting.monthly_allowance||0)*(selectedDays/totalDays)
    }
    for(const row of adjustments.filter(x=>x.payroll_month.startsWith(monthKey))){
      bonus+=Number(row.bonus||0)*(selectedDays/totalDays)
    }
  }

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

  const revenueShare=shares.reduce((sum,row)=>{
    const base=Number(categoryRevenue[row.category]||0)
    return sum+base*(Number(row.share_percent||0)/100)
  },0)

  const productionCommission=commissions
    .filter(row=>row.commission_type==='production')
    .reduce((sum,row)=>sum+Number(row.amount||0),0)
  const courierCommission=commissions
    .filter(row=>row.commission_type==='courier')
    .reduce((sum,row)=>sum+Number(row.amount||0),0)

  const employeeCost=attendancePay+allowance+bonus+revenueShare+productionCommission+courierCommission
  const operatingNet=revenue-operating-employeeCost

  let reserveTotal=0
  for(const row of reserves.filter(row=>row.is_active)){
    if(row.method==='percent_revenue'){
      reserveTotal+=revenue*(Number(row.revenue_percent||0)/100)
    }else{
      for(const [monthKey,selectedDays] of monthDays.entries()){
        const [year,month]=monthKey.split('-').map(Number)
        reserveTotal+=Number(row.monthly_amount||0)*(selectedDays/daysInMonth(year,month))
      }
    }
  }

  const cashOperatingSurplus=cashIn-operating-employeeCost

  return{
    revenue,cashIn,receivable,operating,
    attendancePay,allowance,bonus,revenueShare,productionCommission,courierCommission,
    employeeCost,operatingNet,reserveTotal,netAfterReserve:operatingNet-reserveTotal,
    cashOperatingSurplus
  }
}
