import {canAccess} from '../lib/permissions'
import {type CashAdvanceLimit} from '../lib/cashAdvanceLimit'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileSpreadsheet, Printer, RefreshCw, ChevronLeft } from 'lucide-react'
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
  const [searchParams,setSearchParams]=useSearchParams()
  const selectedParam=searchParams.get('employee')
  const {profile}=useAuth()
  const allowed=canAccess(profile,'finance')
  const [data,setData]=useState<Report|null>(null)
  const [limits,setLimits]=useState<CashAdvanceLimit[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [query,setQuery]=useState('')
  const [includeClosed,setIncludeClosed]=useState(true)
  const detailsRef=useRef<HTMLElement|null>(null)
  const load=useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const {data:response,error:rpcError}=await supabase.rpc('v113134_owner_cash_advance_report')
      if(rpcError)throw rpcError
      if(!response||!Array.isArray(response.employees)||!Array.isArray(response.advances)||!Array.isArray(response.deductions)||!Array.isArray(response.corrections))throw new Error('Format laporan tidak valid')
      const limitResponse=await supabase.rpc('v113137_cash_advance_limits')
      if(limitResponse.error)throw limitResponse.error
      if(!Array.isArray(limitResponse.data))throw new Error('Format batas kasbon tidak valid')
      setLimits(limitResponse.data as CashAdvanceLimit[])
      setData(response as Report)
    }catch(cause){setError(cause instanceof Error?cause.message:String((cause as {message?:string})?.message||cause));setData(null)}
    finally{setLoading(false)}
  },[])
  useEffect(()=>{if(allowed)void load();else{setData(null);setLimits([])}},[load,allowed])

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
  const effectiveSelected=selectedParam
  const currentSelection=useMemo(()=>summaries.find(row=>row.employee.id===effectiveSelected)||null,[summaries,effectiveSelected])
  useEffect(()=>{if(currentSelection&&detailsRef.current)detailsRef.current.scrollIntoView({behavior:'smooth',block:'start'})},[currentSelection?.employee.id])
  const advances=useMemo(()=>data?.advances.filter(a=>a.employee_id===effectiveSelected&&!a.cancelled_at)||[],[data,effectiveSelected])
  const events=useMemo(()=>{
    if(!data||!effectiveSelected)return [] as {id:string;date:string;kind:string;amount:number;details:string}[]
    const issue=advances.map(a=>{
      const corrections=data.corrections.filter(c=>c.cash_advance_id===a.id).sort((x,y)=>x.corrected_at.localeCompare(y.corrected_at)||x.id.localeCompare(y.id))
      const original=corrections.length?number(corrections[0].old_amount):number(a.amount)
      return {id:'i'+a.id,date:a.issued_at,kind:'Kasbon diberikan',amount:original,details:a.note||'—'}
    })
    const deductions=data.deductions.filter(d=>d.employee_id===effectiveSelected&&advances.some(a=>a.id===d.cash_advance_id)).map(d=>({id:'d'+d.id,date:d.created_at,kind:'Potongan gaji',amount:-number(d.amount),details:'Periode gaji '+d.payroll_month}))
    const corrections=data.corrections.filter(c=>c.employee_id===effectiveSelected&&advances.some(a=>a.id===c.cash_advance_id)).map(c=>({id:'c'+c.id,date:c.corrected_at,kind:'Koreksi nominal',amount:number(c.new_amount)-number(c.old_amount),details:`${c.reason} • ${formatRupiah(number(c.old_amount))} → ${formatRupiah(number(c.new_amount))}`}))
    return [...issue,...deductions,...corrections].sort((a,b)=>b.date.localeCompare(a.date))
  },[data,effectiveSelected,advances])
  const limitFor=(id:string)=>limits.find(l=>l.employee_id===id)
  const overLimit=limits.filter(l=>Number(l.excess)>0)
  const exportOptions=(detail=false)=>{
    const current=detail?currentSelection:null
    const totals=filtered.reduce((a,s)=>({total:a.total+s.total,paid:a.paid+s.paid,remaining:a.remaining+s.remaining}),{total:0,paid:0,remaining:0})
    return ({
    title:current?`Rincian Kasbon - ${current.employee.name}`:'Laporan Kasbon Seluruh Karyawan',
    filename:current?`kasbon-${current.employee.login_id}`:'laporan-kasbon-semua-karyawan',
    subtitle:'HappyLaundry Babakan CRB • Saldo kasbon adalah piutang karyawan, bukan biaya operasional',
    headers:current?['Tanggal','Jenis','Kasbon / Perubahan','Potongan / Pembayaran','Saldo Tersisa','Keterangan']:['Karyawan','ID Akun','Total Kasbon','Sudah Dilunasi / Dikoreksi','Sisa Kasbon','Jumlah Kasbon','Gaji Tersedia Bulan Ini','Kelebihan Kasbon'],
    rows:current?[...advances.map(a=>[date(a.issued_at),'Ringkasan kasbon',number(a.amount),Math.max(0,number(a.amount)-number(a.remaining_amount)),number(a.remaining_amount),a.note||'—']),...events.map(e=>[date(e.date),e.kind,e.amount,'','',e.details]),...(limitFor(current.employee.id)?.approvals||[]).map(a=>[date(a.approved_at),'Persetujuan Owner',0,'','',`${a.reason} • Melebihi gaji ${formatRupiah(Number(a.excess))}`])]:filtered.map(s=>[s.employee.name,s.employee.login_id,s.total,s.paid,s.remaining,s.count,Number(limitFor(s.employee.id)?.salary_available||0),Number(limitFor(s.employee.id)?.excess||0)]),
    summary:[['Total Kasbon',current?current.total:totals.total],['Total Terbayar / Selisih Saldo',current?current.paid:totals.paid],['Total Sisa',current?current.remaining:totals.remaining],...(current?[["Gaji Tersedia Bulan Ini",Number(limitFor(current.employee.id)?.salary_available||0)],["Kelebihan Kasbon",Number(limitFor(current.employee.id)?.excess||0)]]:[])] as Array<[string,string|number]>
  })}

  const current=currentSelection
  if(!allowed)return <div className="error-box">Laporan kasbon memerlukan akses Keuangan.</div>
  return <>
    <PageHeader eyebrow="KEUANGAN • KASBON" title="Laporan Kasbon Karyawan" description="Ringkasan seluruh karyawan dan riwayat rinci. Data langsung dari Supabase; laporan hanya baca." action={<button className="secondary-button" onClick={()=>navigate('/finance')}><ChevronLeft size={16}/>Keuangan</button>}/>
    <section className="panel" style={{padding:16}}>
      <div className="cash-report-toolbar">
        <input aria-label="Cari karyawan" placeholder="Cari nama / ID karyawan..." value={query} onChange={e=>setQuery(e.target.value)}/>
        <label><input type="checkbox" checked={includeClosed} onChange={e=>setIncludeClosed(e.target.checked)}/> Tampilkan kasbon lunas</label>
        <button className="secondary-button" disabled={loading} onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button>
        <button className="secondary-button" disabled={!data||loading} onClick={()=>downloadXls(exportOptions())}><FileSpreadsheet size={16}/>Excel</button>
        <button className="secondary-button" disabled={!data||loading} onClick={()=>printPdf(exportOptions())}><Printer size={16}/>Print / PDF</button>
      </div>
      {error&&<div className="error-box">Gagal mengambil laporan: {error}. Pastikan SQL 071, 072, dan 073 sudah dijalankan.</div>}
      {loading&&<p>Memuat seluruh kasbon...</p>}
      {data&&<>
        <div className="cash-report-stats">
          <div><span>Total Kasbon</span><strong>{formatRupiah(grand.total)}</strong></div>
          <div><span>Terbayar / Selisih Saldo</span><strong>{formatRupiah(grand.paid)}</strong></div>
          <div><span>Sisa Piutang Karyawan</span><strong>{formatRupiah(grand.remaining)}</strong></div>
        </div>
        {overLimit.length>0&&<div role="alert" className="error-box">⚠ {overLimit.length} karyawan memiliki saldo kasbon melebihi gaji tersedia bulan berjalan. Periksa tanda peringatan pada nama karyawan.</div>}
        <div className="table-wrap"><table><thead><tr><th>Karyawan</th><th>Total Kasbon</th><th>Terbayar / Selisih</th><th>Sisa Kasbon</th><th>Transaksi</th><th>Aksi</th></tr></thead><tbody>
          {filtered.map(s=><tr key={s.employee.id}><td><button type="button" className="cash-advance-employee-link" onClick={()=>{setSearchParams({employee:s.employee.id})}}>{s.employee.name}</button><small style={{display:'block'}}>{s.employee.login_id}</small>{Number(limitFor(s.employee.id)?.excess)>0&&<small className="cash-advance-over">⚠ Melebihi gaji {formatRupiah(Number(limitFor(s.employee.id)?.excess))}</small>}</td><td>{formatRupiah(s.total)}</td><td>{formatRupiah(s.paid)}</td><td><b>{formatRupiah(s.remaining)}</b></td><td>{s.count}</td><td><button className="secondary-button" onClick={()=>{setSearchParams({employee:s.employee.id})}}>Lihat Rincian</button></td></tr>)}
          {filtered.length===0&&<tr><td colSpan={6}>Belum ada kasbon pada filter ini.</td></tr>}
        </tbody></table></div>
        <p className="cash-report-note">Nilai terbayar/selisih dihitung dari nominal kasbon dikurangi saldo tersisa. Termasuk potongan gaji dan penyesuaian saldo; bukan otomatis berarti uang kas masuk.</p>
      </>}
    </section>
    {data&&!loading&&selectedParam&&!current&&<div className="error-box">Karyawan ini tidak memiliki kasbon aktif atau lunas yang dapat ditampilkan.</div>}
    {current&&<section ref={detailsRef} className="panel" style={{padding:16,scrollMarginTop:90}}>
      <div className="cash-report-detail-heading"><div><h3>Riwayat Kasbon — {current.employee.name}</h3><p>Total kasbon {formatRupiah(current.total)} • Terbayar / selisih saldo {formatRupiah(current.paid)} • Sisa {formatRupiah(current.remaining)}</p></div><div className="cash-report-actions"><button className="secondary-button" disabled={loading} onClick={()=>downloadXls(exportOptions(true))}><FileSpreadsheet size={16}/>Excel Karyawan</button><button className="secondary-button" disabled={loading} onClick={()=>printPdf(exportOptions(true))}><Printer size={16}/>Print Karyawan</button><button className="secondary-button" onClick={()=>{setSearchParams({})}}>Tutup Rincian</button></div></div>
      {limitFor(current.employee.id)&&<div className={Number(limitFor(current.employee.id)?.excess)>0?'error-box':'info-box'} role="status">Gaji tersedia bulan {limitFor(current.employee.id)?.payroll_month.slice(0,7)}: <b>{formatRupiah(Number(limitFor(current.employee.id)?.salary_available))}</b>. {Number(limitFor(current.employee.id)?.excess)>0?`⚠ Kasbon melebihi gaji sebesar ${formatRupiah(Number(limitFor(current.employee.id)?.excess))}.`:'Saldo kasbon masih dalam batas gaji tersedia.'} Gaji dihitung dari data tercatat, setelah potongan kasbon dan pembayaran gaji.</div>}
      <h4>Seluruh Kasbon Karyawan</h4>
      <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Kasbon (setelah koreksi)</th><th>Potongan / Pembayaran</th><th>Saldo Tersisa</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>
        {advances.map(a=><tr key={a.id}><td>{date(a.issued_at)}</td><td>{formatRupiah(number(a.amount))}</td><td>{formatRupiah(Math.max(0,number(a.amount)-number(a.remaining_amount)))}</td><td>{formatRupiah(number(a.remaining_amount))}</td><td>{number(a.remaining_amount)>0?'Aktif':'Lunas'}</td><td>{a.note||'—'}</td></tr>)}
      </tbody></table></div>
      <h4>Riwayat Transaksi & Potongan Gaji</h4>
      <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Nominal / Perubahan</th><th>Keterangan</th></tr></thead><tbody>
        {events.map(e=><tr key={e.id}><td>{date(e.date)}</td><td>{e.kind}</td><td>{formatRupiah(e.amount)}</td><td>{e.details}</td></tr>)}
        {events.length===0&&<tr><td colSpan={4}>Belum ada riwayat.</td></tr>}
      </tbody></table></div>
      {!!limitFor(current.employee.id)?.approvals?.length&&<><h4>Persetujuan Owner atas Kelebihan Kasbon</h4><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Gaji Saat Disetujui</th><th>Saldo Kasbon Saat Disetujui</th><th>Kelebihan</th><th>Alasan</th></tr></thead><tbody>{limitFor(current.employee.id)?.approvals?.map(a=><tr key={a.id}><td>{date(a.approved_at)}</td><td>{formatRupiah(Number(a.salary_available))}</td><td>{formatRupiah(Number(a.outstanding_after))}</td><td>{formatRupiah(Number(a.excess))}</td><td>{a.reason}</td></tr>)}</tbody></table></div></>}
      <p className="cash-report-note">Nominal potongan gaji ditampilkan negatif; koreksi mencatat perubahan nominal. Saldo tersisa mengikuti catatan kasbon. Selisih saldo di luar potongan gaji tidak memiliki rincian metode/tanggal pembayaran pada data lama dan tidak dianggap otomatis sebagai pembayaran tunai.</p>
    </section>}
  </>
}
