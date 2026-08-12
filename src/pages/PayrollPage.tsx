import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarCheck2, CheckCircle2, FileSpreadsheet, FileText, Gift,
  HandCoins, Plus, Save, Search, Settings2, Trash2, UsersRound, WalletCards
} from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { downloadXls, printPdf } from '../lib/exportData'
import { formatRupiah } from '../lib/format'
import { supabase } from '../lib/supabase'

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

const today=()=>new Date().toISOString().slice(0,10)
const currentMonth=()=>new Date().toISOString().slice(0,7)
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
  const[employeeCommissionSettings,setEmployeeCommissionSettings]=useState<EmployeeCommissionSetting[]>([])
  const[commissionLedger,setCommissionLedger]=useState<CommissionLedgerRow[]>([])
  const[payments,setPayments]=useState<Payment[]>([])
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
    const [e,a,s,shr,adj,ecs,ledger,p,oi,sv]=await Promise.all([
      supabase.from('v109_users').select('id,full_name,login_id,phone,is_active').eq('is_active',true).order('full_name'),
      supabase.from('v111_attendance').select('*').gte('attendance_date',range.start).lte('attendance_date',range.end),
      supabase.from('v111_employee_payroll_settings').select('*'),
      supabase.from('v111_employee_revenue_shares').select('*'),
      supabase.from('v111_payroll_adjustments').select('*').eq('payroll_month',range.start),
      supabase.from('v113_employee_commission_settings').select('*'),
      supabase.from('v113_commission_ledger').select('*').gte('earned_at',`${range.start}T00:00:00`).lte('earned_at',`${range.end}T23:59:59.999`),
      supabase.from('v100_payments').select('order_id,amount,created_at').gte('created_at',`${range.start}T00:00:00`).lte('created_at',`${range.end}T23:59:59.999`),
      supabase.from('v100_order_items').select('order_id,service_id,subtotal'),
      supabase.from('v100_services').select('id,category')
    ])
    const error=e.error||a.error||s.error||shr.error||adj.error||ecs.error||ledger.error||p.error||oi.error||sv.error
    if(error)setMessage(error.message)
    else{
      setEmployees((e.data as Employee[])||[])
      setAttendance((a.data as Attendance[])||[])
      setSettings((s.data as PayrollSetting[])||[])
      setShares((shr.data as PayrollShare[])||[])
      setAdjustments((adj.data as PayrollAdjustment[])||[])
      setEmployeeCommissionSettings((ecs.data as EmployeeCommissionSetting[])||[])
      setCommissionLedger((ledger.data as CommissionLedgerRow[])||[])
      setPayments((p.data as Payment[])||[])
      setOrderItems((oi.data as OrderItem[])||[])
      setServices((sv.data as Service[])||[])
      const drafts:Record<string,string>={}
      for(const row of (adj.data as PayrollAdjustment[])||[])drafts[row.employee_id]=String(Number(row.bonus||0))
      setBonusDraft(drafts)
    }
    setLoading(false)
  },[month])

  useEffect(()=>{void load()},[load])

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

    for(const payment of payments){
      const items=itemsByOrder.get(payment.order_id)||[]
      const itemTotal=items.reduce((sum,item)=>sum+Math.max(0,Number(item.subtotal||0)),0)
      const paymentAmount=Math.max(0,Number(payment.amount||0))
      if(paymentAmount<=0)continue

      if(items.length===0||itemTotal<=0){
        grouped['Kiloan']=(grouped['Kiloan']||0)+paymentAmount
        continue
      }

      for(const item of items){
        const subtotal=Math.max(0,Number(item.subtotal||0))
        if(subtotal<=0)continue
        const category=item.service_id
          ? serviceCategory.get(item.service_id)||'Kiloan'
          : 'Kiloan'
        grouped[category]=(grouped[category]||0)+(paymentAmount*(subtotal/itemTotal))
      }
    }

    return grouped
  },[payments,orderItems,services])

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
    const total=attendancePay+allowance+bonus+revenueShare+orderCommission

    return{
      employee,presentDays,permissionDays,sickDays,absentDays,
      attendanceRate,attendancePay,allowance,
      shareDetails,revenueShare,productionCommission,courierCommission,orderCommission,
      commissionOrderCount:new Set(employeeLedger.map(item=>item.order_id)).size,
      bonus,total
    }
  }),[employees,settingMap,sharesByEmployee,attendance,categoryRevenue,commissionLedger,bonusDraft,adjustmentMap])

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
    headers:['Karyawan','Hadir','Tarif/Hari','Uang Kehadiran','Tunjangan','Bonus','Bagi Hasil Kategori','Komisi Produksi','Komisi Kurir','Total Gaji'],
    rows:filteredPayroll.map(r=>[
      r.employee.full_name,r.presentDays,r.attendanceRate,
      Math.round(r.attendancePay),Math.round(r.allowance),Math.round(r.bonus),
      r.shareDetails.length
        ? r.shareDetails.map(item=>`${item.category} ${item.percent.toFixed(2)}% x ${Math.round(item.baseRevenue)} = ${Math.round(item.amount)}`).join(' | ')
        : '-',
      Math.round(r.productionCommission),Math.round(r.courierCommission),Math.round(r.total)
    ]),
    summary:[
      ['Omzet Bulan',Math.round(monthlyRevenue)],
      ['Total Gaji',Math.round(filteredPayroll.reduce((s,r)=>s+r.total,0))]
    ] as Array<[string,string|number]>
  })

  const totalPayroll=payrollRows.reduce((sum,r)=>sum+r.total,0)
  const totalPresent=payrollRows.reduce((sum,r)=>sum+r.presentDays,0)
  const totalOrderCommission=payrollRows.reduce((sum,r)=>sum+r.orderCommission,0)

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
        <StatCard icon={HandCoins} label="Omzet Bulan Ini" value={formatRupiah(monthlyRevenue)} caption="Bagi hasil dihitung per kategori layanan"/>
      </section>

      <section className="panel data-panel">
        <div className="attendance-date-title">
          <div><b>Absensi {new Date(`${attendanceDate}T00:00:00`).toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</b><small>Klik status untuk mencatat atau mengubah kehadiran.</small></div>
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
                          ? ` • ${new Date(attendanceMap.get(`${employee.id}|${attendanceDate}`)!.check_in_at!).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}`
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
                          ? ` • ${new Date(attendanceMap.get(`${employee.id}|${attendanceDate}`)!.check_in_at!).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}`
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
        <StatCard icon={WalletCards} label="Total Gaji" value={formatRupiah(totalPayroll)} caption={`${employees.length} karyawan aktif`}/>
        <StatCard icon={Gift} label="Komisi Order" value={formatRupiah(totalOrderCommission)} caption="Produksi + kurir yang sudah menjadi hak"/>
      </section>

      <section className="panel payroll-formula">
        <HandCoins size={21}/>
        <div><b>Rumus Gaji</b><span>Total Gaji = Uang Kehadiran + Tunjangan + Bonus + Bagi Hasil Kategori + Komisi Order. Komisi produksi dan komisi kurir masuk setelah order Selesai & Lunas.</span></div>
      </section>

      <section className="panel data-panel">
        <div className="payroll-table-head">
          <div><b>Daftar Gaji — {new Date(`${month}-01T00:00:00`).toLocaleDateString('id-ID',{month:'long',year:'numeric'})}</b><small>Komisi per order otomatis terakumulasi sesuai karyawan produksi dan kurir yang dipilih saat transaksi.</small></div>
          <button className="primary-button" onClick={()=>void saveBonuses()} disabled={busy}><Save size={16}/>{busy?'Menyimpan...':'Simpan Bonus'}</button>
        </div>
        <div className="table-wrap">
          <table className="payroll-table">
            <thead><tr>
              <th>Karyawan</th><th>Hadir</th><th>Tarif/Hari</th><th>Uang Hadir</th>
              <th>Tunjangan</th><th>Bonus</th><th>Bagi Hasil Kategori</th><th>Komisi Order</th><th>Total Gaji</th><th>Atur</th>
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
                <td><b className="payroll-total">{formatRupiah(r.total)}</b></td>
                <td><button className="finance-row-action" onClick={()=>openSettings(r.employee)}><Settings2 size={15}/>Atur</button></td>
              </tr>)}
              {filteredPayroll.length===0&&<tr><td colSpan={10} className="table-empty">Belum ada karyawan aktif.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>}

    {overrideTarget&&<Modal
      title={`Ubah Absensi — ${overrideTarget.employee.full_name}`}
      onClose={()=>!busy&&setOverrideTarget(null)}
    >
      <form className="modal-form" onSubmit={saveAttendanceOverride}>
        <div className="attendance-override-card">
          <CalendarCheck2 size={22}/>
          <div>
            <b>Status: {statusLabels[overrideTarget.status]}</b>
            <span>{new Date(`${attendanceDate}T00:00:00`).toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span>
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
