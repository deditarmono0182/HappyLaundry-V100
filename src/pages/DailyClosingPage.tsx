import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Banknote, CalendarDays, CheckCircle2, History, Landmark, LockKeyhole, ReceiptText, RefreshCw, Smartphone, WalletCards } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatIDR } from '../lib/format'
import { supabase } from '../lib/supabase'

interface ClosingSummary{closing_date:string;payment_cash:number;payment_qris:number;payment_transfer:number;payment_other:number;total_income:number;cash_expense:number;total_expense:number;receivable:number;receivable_count:number;expected_cash:number}
interface ClosingRow extends ClosingSummary{id:string;actual_cash:number;cash_difference:number;note:string|null;closed_by_name:string;closed_at:string}
const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date())

export function DailyClosingPage(){
 const[date,setDate]=useState(localDate()),[summary,setSummary]=useState<ClosingSummary|null>(null),[history,setHistory]=useState<ClosingRow[]>([])
 const[actualCash,setActualCash]=useState(''),[note,setNote]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[success,setSuccess]=useState('')
 const load=useCallback(async()=>{setLoading(true);setMessage('');const[s,h]=await Promise.all([supabase.rpc('v11324_daily_closing_summary',{p_date:date}),supabase.from('v11324_daily_closings').select('*').order('closing_date',{ascending:false}).limit(60)])
  if(s.error)setMessage(s.error.message);else{const row=(Array.isArray(s.data)?s.data[0]:s.data) as ClosingSummary|undefined;setSummary(row||null);if(row)setActualCash(String(Math.round(Number(row.expected_cash||0))))}
  if(h.error)setMessage(x=>x||h.error.message);else setHistory((h.data as ClosingRow[])||[]);setLoading(false)},[date])
 useEffect(()=>{void load()},[load])
 const existing=useMemo(()=>history.find(r=>r.closing_date===date)||null,[history,date]),actual=Number(actualCash||0),difference=actual-Number(summary?.expected_cash||0)
 const submit=async(e:FormEvent)=>{e.preventDefault();if(!summary||existing)return;if(!Number.isFinite(actual)||actual<0){setMessage('Kas aktual tidak valid.');return}
  if(!window.confirm(`Tutup kas tanggal ${date}? Snapshot closing tidak menghapus transaksi.`))return;setBusy(true);setMessage('');setSuccess('')
  const{data,error}=await supabase.rpc('v11324_close_day',{p_date:date,p_actual_cash:actual,p_note:note.trim()||null})
  if(error)setMessage(error.message);else{const row=(Array.isArray(data)?data[0]:data) as ClosingRow|undefined;setSuccess(`Closing ${date} berhasil${row?` • Selisih ${formatIDR(Number(row.cash_difference||0))}`:''}.`);setNote('');await load()}setBusy(false)}
 return <>
  <PageHeader eyebrow="KONTROL KAS" title="Closing Harian" description="Cocokkan penerimaan, pengeluaran tunai, kas aktual, dan simpan snapshot akhir hari." action={<button className="secondary-button" onClick={()=>void load()} disabled={loading}><RefreshCw size={17}/>Refresh</button>}/>
  <section className="panel daily-closing-date"><label><CalendarDays size={18}/>Tanggal Closing<input type="date" value={date} max={localDate()} onChange={e=>setDate(e.target.value)}/></label>{existing&&<span className="badge success-badge"><LockKeyhole size={14}/> Sudah Closing</span>}</section>
  {message&&<div className="error-box inline-message">{message}</div>}{success&&<div className="success-box inline-message">{success}</div>}
  <section className="stats-grid compact-stats closing-payment-stats">
   <StatCard label="Tunai" value={formatIDR(Number(summary?.payment_cash||0))} note="Pembayaran order" icon={Banknote}/>
   <StatCard label="QRIS" value={formatIDR(Number(summary?.payment_qris||0))} note="Pembayaran order" icon={Smartphone}/>
   <StatCard label="Transfer" value={formatIDR(Number(summary?.payment_transfer||0))} note="Pembayaran order" icon={Landmark}/>
   <StatCard label="Total Pemasukan" value={formatIDR(Number(summary?.total_income||0))} note="Semua metode pembayaran" icon={WalletCards}/>
  </section>
  <section className="closing-grid">
   <article className="panel closing-recap-card"><header><ReceiptText size={20}/><div><b>Rekap Hari Ini</b><small>Angka diambil otomatis dari transaksi aplikasi.</small></div></header>
    <div className="closing-recap-row"><span>Pembayaran Tunai</span><b>{formatIDR(Number(summary?.payment_cash||0))}</b></div>
    <div className="closing-recap-row"><span>Pengeluaran Tunai</span><b>- {formatIDR(Number(summary?.cash_expense||0))}</b></div>
    <div className="closing-recap-row closing-expected"><span>Kas Seharusnya</span><strong>{formatIDR(Number(summary?.expected_cash||0))}</strong></div>
    <div className="closing-recap-row"><span>Total Pengeluaran</span><b>{formatIDR(Number(summary?.total_expense||0))}</b></div>
    <div className="closing-recap-row"><span>Piutang Aktif</span><b>{formatIDR(Number(summary?.receivable||0))} ({Number(summary?.receivable_count||0)} order)</b></div>
    <small className="closing-help">Kas seharusnya = pembayaran order tunai − pengeluaran yang dibayar tunai. QRIS/Transfer tidak dihitung sebagai uang fisik di laci.</small>
   </article>
   <form className="panel closing-form-card" onSubmit={submit}><header><CheckCircle2 size={20}/><div><b>{existing?'Closing Terkunci':'Tutup Kas'}</b><small>{existing?'Snapshot hari ini sudah tersimpan.':'Masukkan uang tunai fisik yang benar-benar ada.'}</small></div></header>
    <label>Kas Aktual<input type="number" min="0" step="1" value={existing?existing.actual_cash:actualCash} onChange={e=>setActualCash(e.target.value)} disabled={!!existing} required/></label>
    <div className={`closing-difference ${((existing?.cash_difference??difference)===0)?'is-match':'is-different'}`}><span>Selisih Kas</span><strong>{formatIDR(Number(existing?.cash_difference??difference))}</strong></div>
    <label>Catatan Closing<textarea rows={3} value={existing?(existing.note||''):note} onChange={e=>setNote(e.target.value)} disabled={!!existing} placeholder="Opsional: keterangan selisih, uang kecil, dll."/></label>
    {existing?<div className="closing-locked-note"><LockKeyhole size={17}/><span>Ditutup oleh <b>{existing.closed_by_name}</b> • {new Date(existing.closed_at).toLocaleString('id-ID')}</span></div>:<button className="primary-button closing-submit" disabled={busy||loading}>{busy?'Menyimpan Closing...':'Tutup Kas Hari Ini'}</button>}
   </form>
  </section>
  <section className="panel data-panel"><div className="section-title-row"><div><History size={19}/><b>Riwayat Closing</b></div><span>{history.length} catatan terakhir</span></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Pemasukan</th><th>Pengeluaran</th><th>Kas Seharusnya</th><th>Kas Aktual</th><th>Selisih</th><th>Petugas</th><th>Waktu</th></tr></thead><tbody>
   {!loading&&history.length===0&&<tr><td colSpan={8} className="table-empty">Belum ada closing harian.</td></tr>}
   {history.map(row=><tr key={row.id}><td><b>{row.closing_date}</b></td><td>{formatIDR(Number(row.total_income||0))}</td><td>{formatIDR(Number(row.total_expense||0))}</td><td>{formatIDR(Number(row.expected_cash||0))}</td><td>{formatIDR(Number(row.actual_cash||0))}</td><td><b className={Number(row.cash_difference||0)===0?'money-in':'money-out'}>{formatIDR(Number(row.cash_difference||0))}</b></td><td>{row.closed_by_name}</td><td>{new Date(row.closed_at).toLocaleString('id-ID')}</td></tr>)}
  </tbody></table></div></section>
 </>}
