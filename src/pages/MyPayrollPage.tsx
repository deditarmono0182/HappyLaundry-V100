import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarRange, CheckCircle2, CreditCard, HandCoins, ReceiptText, WalletCards } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatRupiah } from '../lib/format'
import { supabase } from '../lib/supabase'
import { businessMonthKey } from '../lib/businessTime'
import { useAuth } from '../lib/auth'

type CommissionDetail={
  order_id:string;order_no:string;type:'production'|'courier';base_amount:number;percent:number;amount:number;earned_at:string
}
type PaymentHistory={id:string;amount:number;payment_method:string;note:string|null;paid_at:string}
type CashAdvanceHistory={id:string;amount:number;remaining_amount:number;note:string|null;issued_at:string}
type MyPayroll={
  employee:{id:string;full_name:string;login_id:string}
  payroll_month:string
  present_days:number;permission_days:number;sick_days:number;absent_days:number
  attendance_rate:number;attendance_pay:number;allowance:number;bonus:number;revenue_share:number
  production_commission:number;courier_commission:number;gross_total:number
  cash_advance_applied:number;cash_advance_outstanding:number;cash_advance_history:CashAdvanceHistory[]
  net_total:number;paid_amount:number;remaining_pay:number
  commission_details:CommissionDetail[];payment_history:PaymentHistory[]
}

export function MyPayrollPage(){
  const {profile}=useAuth()
  const [month,setMonth]=useState(businessMonthKey())
  const [data,setData]=useState<MyPayroll|null>(null)
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const period=`${month}-01`
    const [base,commissions,revenueShare]=await Promise.all([
      supabase.rpc('v113072_my_payroll_base',{p_payroll_month:period}),
      supabase.rpc('v113072_my_commissions',{p_payroll_month:period}),
      supabase.rpc('v113072_my_revenue_share',{p_payroll_month:period})
    ])
    const error=base.error||commissions.error||revenueShare.error
    if(error){setMessage(error.message);setData(null)}
    else{
      const b=(base.data||{}) as any
      const details=((commissions.data||[]) as any[]).map(r=>({
        order_id:r.order_id,order_no:r.order_no,type:r.commission_type,base_amount:Number(r.base_amount||0),
        percent:Number(r.percent||0),amount:Number(r.amount||0),earned_at:r.earned_at
      })) as CommissionDetail[]
      const production=details.filter(r=>r.type==='production').reduce((sum,r)=>sum+Number(r.amount||0),0)
      const courier=details.filter(r=>r.type==='courier').reduce((sum,r)=>sum+Number(r.amount||0),0)
      const present=Number(b.present_days||0)
      const attendanceRate=Number(b.attendance_rate||0)
      const attendancePay=present*attendanceRate
      const share=Number(revenueShare.data||0)
      const gross=attendancePay+Number(b.allowance||0)+Number(b.bonus||0)+share+production+courier
      const applied=Number(b.cash_advance_applied||0)
      const net=Math.max(0,gross-applied)
      const paid=Number(b.paid_amount||0)
      setData({
        ...b,
        present_days:present,permission_days:Number(b.permission_days||0),sick_days:Number(b.sick_days||0),absent_days:Number(b.absent_days||0),
        attendance_rate:attendanceRate,attendance_pay:attendancePay,allowance:Number(b.allowance||0),bonus:Number(b.bonus||0),
        revenue_share:share,production_commission:production,courier_commission:courier,gross_total:gross,
        cash_advance_applied:applied,cash_advance_outstanding:Number(b.cash_advance_outstanding||0),
        net_total:net,paid_amount:paid,remaining_pay:Math.max(0,net-paid),commission_details:details,
        cash_advance_history:(b.cash_advance_history||[]) as CashAdvanceHistory[],payment_history:(b.payment_history||[]) as PaymentHistory[]
      } as MyPayroll)
    }
    setLoading(false)
  },[month])

  useEffect(()=>{void load()},[load])

  const status=useMemo(()=>{
    if(!data)return '-'
    if(data.gross_total>0&&data.net_total<=0&&data.cash_advance_applied>0)return 'Terpotong Kas Bon'
    if(data.net_total<=0&&data.paid_amount<=0)return 'Nihil'
    if(data.remaining_pay<=0)return 'Lunas'
    if(data.paid_amount>0)return 'Sebagian'
    return 'Belum Dibayar'
  },[data])

  if(profile?.role!=='employee')return <section className="panel"><b>Gaji Saya khusus akun karyawan.</b></section>

  return <div className="page-stack">
    <PageHeader title="Gaji Saya" description="Rincian gaji, komisi, kas bon, dan riwayat pembayaran milik akun Anda sendiri."/>

    <section className="panel my-payroll-toolbar">
      <label><CalendarRange size={17}/> Periode
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
      </label>
      <button className="secondary-button" onClick={()=>void load()} disabled={loading}>Muat Ulang</button>
    </section>

    {message&&<div className="error-box">{message}</div>}
    {loading&&<section className="panel">Memuat rincian gaji...</section>}

    {!loading&&data&&<>
      <section className="stats-grid my-payroll-stats">
        <StatCard icon={WalletCards} label="Gaji Kotor" value={formatRupiah(Number(data.gross_total||0))} caption={`${data.present_days||0} hari hadir`}/>
        <StatCard icon={HandCoins} label="Potongan Kas Bon" value={formatRupiah(Number(data.cash_advance_applied||0))} caption={`Sisa kas bon ${formatRupiah(Number(data.cash_advance_outstanding||0))}`}/>
        <StatCard icon={CreditCard} label="Gaji Bersih" value={formatRupiah(Number(data.net_total||0))} caption={`Status: ${status}`}/>
        <StatCard icon={CheckCircle2} label="Sudah Dibayar" value={formatRupiah(Number(data.paid_amount||0))} caption={`Sisa ${formatRupiah(Number(data.remaining_pay||0))}`}/>
      </section>

      <section className="panel my-payroll-breakdown">
        <div className="section-title"><b>Rincian Gaji</b><small>{data.employee.full_name} • {data.employee.login_id}</small></div>
        <div className="my-payroll-grid">
          <div><span>Uang Kehadiran</span><b>{formatRupiah(Number(data.attendance_pay||0))}</b><small>{data.present_days} hadir × {formatRupiah(Number(data.attendance_rate||0))}</small></div>
          <div><span>Tunjangan</span><b>{formatRupiah(Number(data.allowance||0))}</b></div>
          <div><span>Bonus</span><b>{formatRupiah(Number(data.bonus||0))}</b></div>
          <div><span>Bagi Hasil Kategori</span><b>{formatRupiah(Number(data.revenue_share||0))}</b></div>
          <div><span>Komisi Produksi</span><b>{formatRupiah(Number(data.production_commission||0))}</b></div>
          <div><span>Komisi Kurir</span><b>{formatRupiah(Number(data.courier_commission||0))}</b></div>
          <div className="emphasis"><span>Gaji Kotor</span><b>{formatRupiah(Number(data.gross_total||0))}</b></div>
          <div className="deduction"><span>Kas Bon Dipotong</span><b>− {formatRupiah(Number(data.cash_advance_applied||0))}</b></div>
          <div className="emphasis"><span>Gaji Bersih</span><b>{formatRupiah(Number(data.net_total||0))}</b></div>
        </div>
      </section>

      <section className="panel data-panel">
        <div className="section-title"><ReceiptText size={18}/><b>Sumber Komisi Order</b></div>
        <div className="table-wrap"><table className="payroll-commission-detail">
          <thead><tr><th>Order</th><th>Peran</th><th>Nilai Order</th><th>%</th><th>Komisi</th><th>Tanggal Hak</th></tr></thead>
          <tbody>
            {(data.commission_details||[]).map((r,i)=><tr key={`${r.order_id}-${r.type}-${i}`}>
              <td><b>{r.order_no}</b></td><td>{r.type==='production'?'Produksi':'Kurir'}</td>
              <td>{formatRupiah(Number(r.base_amount||0))}</td><td>{Number(r.percent||0).toFixed(2)}%</td>
              <td><b>{formatRupiah(Number(r.amount||0))}</b></td><td>{new Date(r.earned_at).toLocaleString('id-ID')}</td>
            </tr>)}
            {(!data.commission_details||data.commission_details.length===0)&&<tr><td colSpan={6} className="table-empty">Belum ada komisi order pada periode ini.</td></tr>}
          </tbody>
        </table></div>
      </section>

      <section className="panel data-panel">
        <div className="section-title"><HandCoins size={18}/><b>Riwayat Kas Bon</b></div>
        <div className="table-wrap"><table className="payroll-commission-detail">
          <thead><tr><th>Tanggal</th><th>Nominal</th><th>Sisa</th><th>Keterangan</th></tr></thead>
          <tbody>
            {(data.cash_advance_history||[]).map(r=><tr key={r.id}><td>{new Date(r.issued_at).toLocaleString('id-ID')}</td><td><b>{formatRupiah(Number(r.amount||0))}</b></td><td>{formatRupiah(Number(r.remaining_amount||0))}</td><td>{r.note||'-'}</td></tr>)}
            {(!data.cash_advance_history||data.cash_advance_history.length===0)&&<tr><td colSpan={4} className="table-empty">Belum ada kas bon.</td></tr>}
          </tbody>
        </table></div>
      </section>

      <section className="panel data-panel">
        <div className="section-title"><CreditCard size={18}/><b>Riwayat Pembayaran Gaji</b></div>
        <div className="table-wrap"><table className="payroll-commission-detail">
          <thead><tr><th>Tanggal</th><th>Metode</th><th>Nominal</th><th>Catatan</th></tr></thead>
          <tbody>
            {(data.payment_history||[]).map(r=><tr key={r.id}><td>{new Date(r.paid_at).toLocaleString('id-ID')}</td><td>{r.payment_method}</td><td><b>{formatRupiah(Number(r.amount||0))}</b></td><td>{r.note||'-'}</td></tr>)}
            {(!data.payment_history||data.payment_history.length===0)&&<tr><td colSpan={4} className="table-empty">Belum ada pembayaran gaji pada periode ini.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </>}
  </div>
}
