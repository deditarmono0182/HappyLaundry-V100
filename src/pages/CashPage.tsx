import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Banknote, CalendarDays, FileSpreadsheet, Plus, Search, WalletCards } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { formatIDR } from '../lib/format'
import { downloadXls } from '../lib/exportData'
import { supabase } from '../lib/supabase'

type CashKind = 'income' | 'expense'
type PaymentMethod = 'cash' | 'qris' | 'transfer' | 'other'

interface CashRow {
  id: string
  kind: CashKind
  category: string
  description: string
  amount: number
  method: PaymentMethod
  created_at: string
}

const methodLabels: Record<PaymentMethod,string> = {
  cash:'Tunai', qris:'QRIS', transfer:'Transfer', other:'Lainnya'
}

const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date())
const shiftDate=(date:string,days:number)=>{
  const d=new Date(`${date}T12:00:00`)
  d.setDate(d.getDate()+days)
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(d)
}
const monthStart=(date:string)=>`${date.slice(0,7)}-01`

export function CashPage(){
  const [rows,setRows]=useState<CashRow[]>([])
  const [loading,setLoading]=useState(true)
  const [query,setQuery]=useState('')
  const [message,setMessage]=useState('')
  const [open,setOpen]=useState(false)
  const [busy,setBusy]=useState(false)
  const [period,setPeriod]=useState<'today'|'7days'|'month'|'custom'>('today')
  const [from,setFrom]=useState(localDate())
  const [to,setTo]=useState(localDate())
  const [form,setForm]=useState({kind:'expense' as CashKind,category:'Operasional',description:'',amount:0,method:'cash' as PaymentMethod})

  const load=useCallback(async()=>{
    setLoading(true)
    const {data,error}=await supabase.from('v100_cash_transactions').select('*').order('created_at',{ascending:false})
    if(error)setMessage(error.message)
    else setRows((data as CashRow[])||[])
    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  const setQuickPeriod=(value:'today'|'7days'|'month'|'custom')=>{
    setPeriod(value)
    const today=localDate()
    if(value==='today'){setFrom(today);setTo(today)}
    if(value==='7days'){setFrom(shiftDate(today,-6));setTo(today)}
    if(value==='month'){setFrom(monthStart(today));setTo(today)}
  }

  const periodRows=useMemo(()=>rows.filter(r=>{
    const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date(r.created_at))
    return date>=from&&date<=to
  }),[rows,from,to])

  const filtered=useMemo(()=>{
    const k=query.toLowerCase().trim()
    if(!k)return periodRows
    return periodRows.filter(r=>`${r.category} ${r.description} ${methodLabels[r.method]}`.toLowerCase().includes(k))
  },[periodRows,query])

  const income=periodRows.filter(r=>r.kind==='income').reduce((s,r)=>s+Number(r.amount),0)
  const expense=periodRows.filter(r=>r.kind==='expense').reduce((s,r)=>s+Number(r.amount),0)

  const exportXls=()=>{
    downloadXls({
      title:'Kas Harian HappyLaundry',
      filename:`kas-harian-${from}-${to}`,
      subtitle:`Periode ${from} s/d ${to}`,
      headers:['Tanggal/Waktu','Jenis','Kategori','Keterangan','Metode','Nominal'],
      rows:periodRows.map(r=>[
        new Date(r.created_at).toLocaleString('id-ID'),
        r.kind==='income'?'Masuk':'Keluar',
        r.category,
        r.description,
        methodLabels[r.method],
        r.kind==='income'?Number(r.amount):-Number(r.amount)
      ]),
      summary:[
        ['Kas Masuk',income],
        ['Kas Keluar',expense],
        ['Saldo',income-expense]
      ]
    })
  }

  const submit=async(e:FormEvent)=>{
    e.preventDefault();setMessage('')
    if(!form.description.trim()||Number(form.amount)<=0){setMessage('Isi keterangan dan nominal dengan benar.');return}
    setBusy(true)
    const {error}=await supabase.from('v100_cash_transactions').insert({
      kind:form.kind,category:form.category.trim(),description:form.description.trim(),amount:Number(form.amount),method:form.method
    })
    if(error)setMessage(error.message)
    else{setOpen(false);setForm({kind:'expense',category:'Operasional',description:'',amount:0,method:'cash'});await load()}
    setBusy(false)
  }

  return <>
    <PageHeader eyebrow="KEUANGAN" title="Kas Harian" description="Catat pemasukan dan pengeluaran operasional harian." action={<div className="cash-header-actions"><button className="secondary-button" onClick={exportXls}><FileSpreadsheet size={18}/> Export XLS</button><button className="primary-button" onClick={()=>setOpen(true)}><Plus size={18}/> Transaksi Kas</button></div>}/>
    <section className="panel cash-period-panel">
      <div className="cash-period-buttons">
        <button type="button" className={period==='today'?'active':''} onClick={()=>setQuickPeriod('today')}>Hari Ini</button>
        <button type="button" className={period==='7days'?'active':''} onClick={()=>setQuickPeriod('7days')}>7 Hari</button>
        <button type="button" className={period==='month'?'active':''} onClick={()=>setQuickPeriod('month')}>Bulan Ini</button>
        <button type="button" className={period==='custom'?'active':''} onClick={()=>setQuickPeriod('custom')}>Pilih Tanggal</button>
      </div>
      <div className="cash-period-dates">
        <label><CalendarDays size={16}/>Dari<input type="date" value={from} onChange={e=>{setPeriod('custom');setFrom(e.target.value)}}/></label>
        <label><CalendarDays size={16}/>Sampai<input type="date" value={to} onChange={e=>{setPeriod('custom');setTo(e.target.value)}}/></label>
      </div>
    </section>

    <section className="stats-grid compact-stats">
      <article className="stat-card"><div className="stat-icon"><ArrowDownCircle size={22}/></div><div><span>Kas Masuk Periode</span><strong>{formatIDR(income)}</strong><small>Pemasukan tercatat</small></div></article>
      <article className="stat-card"><div className="stat-icon"><ArrowUpCircle size={22}/></div><div><span>Kas Keluar Periode</span><strong>{formatIDR(expense)}</strong><small>Pengeluaran tercatat</small></div></article>
      <article className="stat-card"><div className="stat-icon"><WalletCards size={22}/></div><div><span>Saldo Periode</span><strong>{formatIDR(income-expense)}</strong><small>Masuk dikurangi keluar</small></div></article>
    </section>
    <section className="panel data-panel">
      <div className="toolbar"><label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari kategori atau keterangan"/></label><span className="record-count">{filtered.length} transaksi</span></div>
      {message&&<div className="error-box inline-message">{message}</div>}
      <div className="table-wrap"><table><thead><tr><th>Jenis</th><th>Kategori</th><th>Keterangan</th><th>Metode</th><th>Nominal</th><th>Waktu</th></tr></thead><tbody>
        {loading&&<tr><td colSpan={6} className="table-empty">Memuat kas...</td></tr>}
        {!loading&&filtered.length===0&&<tr><td colSpan={6} className="table-empty"><Banknote size={30}/>Belum ada transaksi kas.</td></tr>}
        {filtered.map(r=><tr key={r.id}><td><span className={`badge cash-${r.kind}`}>{r.kind==='income'?'Masuk':'Keluar'}</span></td><td><b>{r.category}</b></td><td>{r.description}</td><td>{methodLabels[r.method]}</td><td><b className={r.kind==='income'?'money-in':'money-out'}>{r.kind==='income'?'+':'-'}{formatIDR(Number(r.amount))}</b></td><td>{new Date(r.created_at).toLocaleString('id-ID')}</td></tr>)}
      </tbody></table></div>
    </section>
    {open&&<Modal title="Transaksi Kas Baru" onClose={()=>setOpen(false)}><form className="modal-form" onSubmit={submit}>
      <label>Jenis<select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value as CashKind})}><option value="expense">Kas Keluar</option><option value="income">Kas Masuk</option></select></label>
      <label>Kategori<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})} required/></label>
      <label>Keterangan<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} required placeholder="Contoh: beli plastik laundry"/></label>
      <label>Nominal<input type="number" min="1" value={form.amount} onChange={e=>setForm({...form,amount:Number(e.target.value)})} required/></label>
      <label>Metode<select value={form.method} onChange={e=>setForm({...form,method:e.target.value as PaymentMethod})}><option value="cash">Tunai</option><option value="qris">QRIS</option><option value="transfer">Transfer</option><option value="other">Lainnya</option></select></label>
      {message&&<div className="error-box">{message}</div>}
      <div className="form-actions"><button type="button" className="secondary-button" onClick={()=>setOpen(false)}>Batal</button><button className="primary-button" disabled={busy}>{busy?'Menyimpan...':'Simpan'}</button></div>
    </form></Modal>}
  </>
}
