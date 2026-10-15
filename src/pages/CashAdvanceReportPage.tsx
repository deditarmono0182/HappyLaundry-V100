import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet, Printer, RefreshCw, Search, ChevronLeft } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { formatRupiah } from '../lib/format'
import { downloadXls, printPdf } from '../lib/exportData'

type Employee={id:string;name:string;login_id:string;active:boolean}
type Advance={id:string;employee_id:string;amount:number;remaining_amount:number;note:string|null;issued_at:string;cancelled_at:string|null}
type Deduction={id:string;employee_id:string;cash_advance_id:string;amount:number;payroll_month:string;created_at:string}
type Correction={id:string;employee_id:string;cash_advance_id:string;old_amount:number;new_amount:number;old_remaining:number;new_remaining:number;reason:string;corrected_at:string}
type Report={employees:Employee[];advances:Advance[];deductions:Deduction[];corrections:Correction[]}
type Summary={employee:Employee;total:number;paid:number;remaining:number;count:number}
const date=(value:string)=>new Date(value).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short',year:'numeric'})
const number=(value:unknown)=>Number(value||0)

export function CashAdvanceReportPage(){
  const navigate=useNavigate()
  const {profile}=useAuth()
  const [data,setData]=useState<Report|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [query,setQuery]=useState('')
  const [selected,setSelected]=useState<string|null>(null)
  const [includeClosed,setIncludeClosed]=useState(true)
  const load=useCallback(async()=>{
    setLoading(true);setError('')
    const {data:response,error:rpcError}=await supabase.rpc('v113134_owner_cash_advance_report')
    if(rpcError){setError(rpcError.message);setData(null)}
    else setData(response as Report)
    setLoading(false)
  },[])
  useEffect(()=>{if(profile?.role==='owner')void load()},[load,profile?.role])

  const summaries=useMemo<Summary[]>(()=>{
    if(!data)return []
    return data.employees.map(employee=>{
      const rows=data.advances.filter(a=>a.employee_id===employee.id&&!a.cancelled_at)
      const total=rows.reduce((sum,a)=>sum+number(a.amount),0)
      const remaining=rows.reduce((sum,a)=>sum+number(a.remaining_amount),0)
      return {employee,total,remaining,paid:Math.max(0,total-remaining),count:rows.length}
    }).filter(row=>row.count>0).sort((a,b)=>b.remaining-a.remaining||a.employee.name.localeCompare(b.employee.name))
  },[data])
  const filtered=useMemo(()=>summaries.filter(s=>(includeClosed||s.remaining>0)&&`${s.employee.name} ${s.employee.login_id}`.toLowerCase().includes(query.toLowerCase())),[summaries,query,includeClosed])
  const grand=useMemo(()=>summaries.reduce((a,s)=>({total:a.total+s.total,paid:a.paid+s.paid,remaining:a.remaining+s.remaining}),{total:0,paid:0,remaining:0}),[summaries])
  const current=useMemo(()=>summaries.find(row=>row.employee.id===selected)||null,[summaries,selected])
  const advances=useMemo(()=>data?.advances.filter(a=>a.employee_id===selected&&!a.cancelled_at)||[],[data,selected])
  const events=useMemo(()=>{
    if(!data||!selected)return [] as {id:string;date:string;kind:string;amount:number;details:string}[]
    const issue=advances.map(a=>({id:'i'+a.id,date:a.issued_at,kind:'Kasbon diberikan',amount:number(a.amount),details:a.note||'—'}))
    const deductions=data.deductions.filter(d=>d.employee_id===selected&&advances.some(a=>a.id===d.cash_advance_id)).map(d=>({id:'d'+d.id,date:d.created_at,kind:'Potongan gaji',amount:-number(d.amount),details:'Periode gaji '+d.payroll_month}))
    const corrections=data.corrections.filter(c=>c.employee_id===selected&&advances.some(a=>a.id===c.cash_advance_id)).map(c=>({id:'c'+c.id,date:c.corrected_at,kind:'Koreksi nominal',amount:number(c.new_amount)-number(c.old_amount),details:`${c.reason} • ${formatRupiah(number(c.old_amount))} → ${formatRupiah(number(c.new_amount))}`}))
    return [...issue,...deductions,...corrections].sort((a,b)=>b.date.localeCompare(a.date))
  },[data,selected,advances])
  const exportOptions=()=>({
    title:current?`Rincian Kasbon - ${current.employee.name}`:'Laporan Kasbon Seluruh Karyawan',
    filename:current?`kasbon-${current.employee.login_id}`:'laporan-kasbon-semua-karyawan',
    subtitle:'HappyLaundry Babakan CRB • Saldo kasbon adalah piutang karyawan, bukan biaya operasional',
    headers:current?['Tanggal','Jenis','Perubahan Kasbon','Keterangan']:['Karyawan','ID Akun','Total Kasbon','Sudah Dilunasi / Dikoreksi','Sisa Kasbon','Jumlah Kasbon'],
    rows:current?events.map(e=>[date(e.date),e.kind,e.amount,e.details]):filtered.map(s=>[s.employee.name,s.employee.login_id,s.total,s.paid,s.remaining,s.count]),
    summary:[['Total Kasbon',current?current.total:grand.total],['Total Terbayar / Selisih Saldo',current?current.paid:grand.paid],['Total Sisa',current?current.remaining:grand.remaining]] as Array<[string,string|number]>
  })

  if(profile?.role!=='owner')return <div className="error-box">Laporan kasbon seluruh karyawan hanya untuk Owner.</div>
  return <>
    <PageHeader eyebrow="OWNER • KEUANGAN" title="Laporan Kasbon Karyawan" description="Ringkasan seluruh karyawan dan riwayat rinci. Data langsung dari Supabase; laporan hanya baca." action={<button className="secondary-button" onClick={()=>navigate('/finance')}><ChevronLeft size={16}/>Keuangan</button>}/>
    <section className="panel" style={{padding:16}}>
      <div className="cash-report-toolbar">
        <input aria-label="Cari karyawan" placeholder="Cari nama / ID karyawan..." value={query} onChange={e=>setQuery(e.target.value)}/>
        <label><input type="checkbox" checked={includeClosed} onChange={e=>setIncludeClosed(e.target.checked)}/> Tampilkan kasbon lunas</label>
        <button className="secondary-button" disabled={loading} onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button>
        <button className="secondary-button" disabled={!data} onClick={()=>downloadXls(exportOptions())}><FileSpreadsheet size={16}/>Excel</button>
        <button className="secondary-button" disabled={!data} onClick={()=>printPdf(exportOptions())}><Printer size={16}/>Print / PDF</button>
      </div>
      {error&&<div className="error-box">Gagal mengambil laporan: {error}. Pastikan SQL 071 sudah dijalankan.</div>}
      {loading&&<p>Memuat seluruh kasbon...</p>}
      {data&&<>
        <div className="cash-report-stats">
          <div><span>Total Kasbon</span><strong>{formatRupiah(grand.total)}</strong></div>
          <div><span>Terbayar / Selisih Saldo</span><strong>{formatRupiah(grand.paid)}</strong></div>
          <div><span>Sisa Piutang Karyawan</span><strong>{formatRupiah(grand.remaining)}</strong></div>
        </div>
        <div className="table-wrap"><table><thead><tr><th>Karyawan</th><th>Total Kasbon</th><th>Terbayar / Selisih</th><th>Sisa Kasbon</th><th>Transaksi</th><th>Aksi</th></tr></thead><tbody>
          {filtered.map(s=><tr key={s.employee.id}><td><b>{s.employee.name}</b><small style={{display:'block'}}>{s.employee.login_id}</small></td><td>{formatRupiah(s.total)}</td><td>{formatRupiah(s.paid)}</td><td><b>{formatRupiah(s.remaining)}</b></td><td>{s.count}</td><td><button className="secondary-button" onClick={()=>setSelected(s.employee.id)}>Lihat Rincian</button></td></tr>)}
          {filtered.length===0&&<tr><td colSpan={6}>Belum ada kasbon pada filter ini.</td></tr>}
        </tbody></table></div>
        <p className="cash-report-note">Nilai terbayar/selisih dihitung dari nominal kasbon dikurangi saldo tersisa. Termasuk potongan gaji dan penyesuaian saldo; bukan otomatis berarti uang kas masuk.</p>
      </>}
    </section>
    {current&&<section className="panel" style={{padding:16}}>
      <div className="cash-report-detail-heading"><div><h3>Riwayat Kasbon — {current.employee.name}</h3><p>Total {formatRupiah(current.total)} • Sisa {formatRupiah(current.remaining)}</p></div><button className="secondary-button" onClick={()=>setSelected(null)}>Tutup Rincian</button></div>
      <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Nominal / Perubahan</th><th>Keterangan</th></tr></thead><tbody>
        {events.map(e=><tr key={e.id}><td>{date(e.date)}</td><td>{e.kind}</td><td>{formatRupiah(e.amount)}</td><td>{e.details}</td></tr>)}
        {events.length===0&&<tr><td colSpan={4}>Belum ada riwayat.</td></tr>}
      </tbody></table></div>
      <p className="cash-report-note">Nominal potongan gaji ditampilkan negatif; koreksi mencatat perubahan nominal. Pelunasan tunai di luar potongan gaji tercermin pada saldo bila telah dicatat di sistem.</p>
    </section>}
  </>
}
