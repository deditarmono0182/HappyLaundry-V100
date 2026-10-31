import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabase'
import {formatRupiah} from '../lib/format'
import {BUSINESS_TIME_ZONE} from '../lib/businessTime'
import {downloadXls,printPdf} from '../lib/exportData'
type Deduction={id:string;cash_advance_id:string;payroll_month:string;amount:number;created_at:string}
type Correction={id:string;payroll_month:string;old_amount:number;new_amount:number;new_remaining:number;reason:string;created_at:string;before_details?:{deductions?:Deduction[]};after_details?:{deductions?:Deduction[]}}
export function PayrollDeductionHistory({employee,month,allInitially=false,onReady}:{employee:{id:string;full_name:string};month:string;allInitially?:boolean;onReady:(ready:boolean)=>void}){
 const [all,setAll]=useState(allInitially),[revision,setRevision]=useState(0),[loading,setLoading]=useState(true)
 const [deductions,setDeductions]=useState<Deduction[]>([]),[corrections,setCorrections]=useState<Correction[]>([])
 const [deductionError,setDeductionError]=useState(''),[correctionError,setCorrectionError]=useState('')
 useEffect(()=>{
  let alive=true;onReady(false);setLoading(true);setDeductionError('');setCorrectionError('');setDeductions([]);setCorrections([])
  const paged=async(table:string,columns:string)=>{
   const rows:unknown[]=[]
   for(let offset=0;;offset+=100){
    let q=supabase.from(table).select(columns).eq('employee_id',employee.id)
    if(!all)q=q.eq('payroll_month',`${month}-01`)
    const r=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+99)
    if(r.error)throw r.error
    const page=r.data||[];rows.push(...page);if(page.length<100)break
   }
   return rows
  }
  const run=async()=>{
   const [d,c]=await Promise.allSettled([
    paged('v113072_cash_advance_deductions','id,cash_advance_id,payroll_month,amount,created_at'),
    paged('v113152_deduction_corrections','id,payroll_month,old_amount,new_amount,new_remaining,reason,created_at,before_details,after_details')
   ])
   if(!alive)return
   if(d.status==='fulfilled')setDeductions(d.value as Deduction[])
   else setDeductionError(`Riwayat potongan gagal dimuat: ${String(d.reason?.message||d.reason)}`)
   if(c.status==='fulfilled')setCorrections(c.value as Correction[])
   else setCorrectionError(`Riwayat koreksi belum dapat dimuat: ${String(c.reason?.message||c.reason)}. Pastikan SQL 081 sudah dijalankan.`)
   setLoading(false);onReady(d.status==='fulfilled'&&c.status==='fulfilled')
  }
  void run();return()=>{alive=false}
 },[employee.id,month,all,revision,onReady])
 const rows=useMemo(()=>{
  const map=new Map<string,Deduction&{current:number;reason:string}>()
  const active=new Map(deductions.map(r=>[r.id,r]))
  const remember=(r:Deduction)=>{
   if(!r?.id||(!all&&r.payroll_month!==`${month}-01`))return
   if(!map.has(r.id))map.set(r.id,{...r,amount:Number(r.amount),current:Number(active.get(r.id)?.amount||0),reason:''})
  }
  for(const c of [...corrections].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))){
   const before=c.before_details?.deductions||[],after=c.after_details?.deductions||[]
   before.forEach(remember);after.forEach(remember)
   for(const id of new Set([...before,...after].map(r=>r.id))){
    if(Number(before.find(r=>r.id===id)?.amount||0)!==Number(after.find(r=>r.id===id)?.amount||0)){
     const row=map.get(id);if(row)row.reason=c.reason
    }
   }
  }
  deductions.forEach(remember)
  return [...map.values()].sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id))
 },[deductions,corrections,all,month])
 const total=deductions.reduce((s,r)=>s+Number(r.amount),0)
 const status=(r:(typeof rows)[number])=>r.current===0?(r.reason?'Dibatalkan melalui koreksi':'Tidak aktif'):r.current!==r.amount?'Dikoreksi':'Terpotong'
 const time=(v:string)=>new Date(v).toLocaleString('id-ID',{timeZone:BUSINESS_TIME_ZONE})
 const options=()=>({title:`Riwayat Potongan Gaji — ${employee.full_name}`,filename:`potongan-kasbon-${employee.id}-${all?'semua':month}`,subtitle:`${all?'Seluruh bulan':`Bulan gaji ${month}`} • Waktu WIB • Nominal aktif sudah memperhitungkan koreksi.`,headers:['Tanggal Potong (WIB)','Bulan Gaji','Nominal Awal Tercatat','Potongan Aktif','Status','Keterangan Terakhir'],rows:rows.map(r=>[time(r.created_at),r.payroll_month.slice(0,7),Number(r.amount),r.current,status(r),r.reason||'-']),summary:[['Total Potongan Aktif',total],['Jumlah Transaksi',rows.length]] as Array<[string,string|number]>})
 return <section className="deduction-history-section payroll-deduction-history">
  <div className="section-title"><b>Riwayat Potongan Gaji — {employee.full_name}</b></div>
  <div className="deduction-history-toolbar">
   <label><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/> Tampilkan seluruh bulan</label>
   <button className="secondary-button" onClick={()=>setRevision(r=>r+1)} disabled={loading}>Muat Ulang Riwayat</button>
   <button className="secondary-button" disabled={loading||!!deductionError||!!correctionError} onClick={()=>downloadXls(options())}>XLS Riwayat</button>
   <button className="secondary-button" disabled={loading||!!deductionError||!!correctionError} onClick={()=>printPdf(options())}>Print / PDF Riwayat</button>
  </div>
  <p>{all?'Seluruh bulan':`Bulan gaji ${month}`} • Total potongan aktif <b>{loading||deductionError?'Belum tersedia':formatRupiah(total)}</b>. Nominal yang dibatalkan tidak ikut total aktif. Riwayat sebelum/sesudah koreksi tetap ditampilkan.</p>
  {loading&&<p>Memuat riwayat potongan...</p>}
  {deductionError&&<div className="error-box">{deductionError}</div>}
  {correctionError&&<div className="error-box">{correctionError}</div>}
  {!loading&&!deductionError&&<div className="table-wrap deduction-correction-history"><table>
   <thead><tr><th>Tanggal Potong (WIB)</th><th>Bulan Gaji</th><th>Nominal Awal Tercatat</th><th>Potongan Aktif</th><th>Status</th><th>Keterangan Terakhir</th></tr></thead>
   <tbody>{rows.map(r=><tr key={r.id}><td>{time(r.created_at)}</td><td>{r.payroll_month.slice(0,7)}</td><td>{formatRupiah(r.amount)}</td><td>{formatRupiah(r.current)}</td><td>{status(r)}</td><td>{r.reason||'-'}</td></tr>)}
    {!rows.length&&<tr><td colSpan={6}>Belum ada transaksi potongan pada periode ini.</td></tr>}
   </tbody>
  </table></div>}
  <div className="section-title"><b>Riwayat Perubahan Potongan</b></div>
  {!loading&&!correctionError&&<div className="table-wrap deduction-correction-history"><table>
   <thead><tr><th>Waktu Koreksi (WIB)</th><th>Bulan Gaji</th><th>Potongan Lama</th><th>Potongan Baru</th><th>Sisa Utang Setelah</th><th>Alasan</th></tr></thead>
   <tbody>{corrections.map(c=><tr key={c.id}><td>{time(c.created_at)}</td><td>{c.payroll_month.slice(0,7)}</td><td>{formatRupiah(Number(c.old_amount))}</td><td>{formatRupiah(Number(c.new_amount))}</td><td>{formatRupiah(Number(c.new_remaining))}</td><td>{c.reason}</td></tr>)}
    {!corrections.length&&<tr><td colSpan={6}>Belum ada koreksi potongan pada periode ini.</td></tr>}
   </tbody>
  </table></div>}
 </section>
}
