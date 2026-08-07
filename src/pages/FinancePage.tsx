import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, FileSpreadsheet, Plus, ReceiptText, Search, TrendingDown, TrendingUp, WalletCards } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatRupiah } from '../lib/format'
import { supabase } from '../lib/supabase'

interface ExpenseCategory{
  id:string
  name:string
  group_name:string
}

interface ExpenseRow{
  id:string
  expense_date:string
  category_id:string|null
  category_name:string
  group_name:string|null
  amount:number
  payment_method:string
  description:string|null
  reference:string|null
  created_at:string
}

interface PaymentRow{
  amount:number
  created_at:string
}

const today=()=>new Date().toISOString().slice(0,10)
const monthStart=()=>{
  const d=new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}

export function FinancePage(){
  const [categories,setCategories]=useState<ExpenseCategory[]>([])
  const [expenses,setExpenses]=useState<ExpenseRow[]>([])
  const [payments,setPayments]=useState<PaymentRow[]>([])
  const [from,setFrom]=useState(monthStart())
  const [to,setTo]=useState(today())
  const [query,setQuery]=useState('')
  const [open,setOpen]=useState(false)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [form,setForm]=useState({
    expense_date:today(),category_id:'',amount:'',payment_method:'cash',
    description:'',reference:''
  })

  const load=useCallback(async()=>{
    setMessage('')
    const [c,e,p]=await Promise.all([
      supabase.from('v106_expense_categories').select('*').eq('is_active',true).order('group_name').order('name'),
      supabase.from('v106_expenses_view').select('*').gte('expense_date',from).lte('expense_date',to).order('expense_date',{ascending:false}),
      supabase.from('v100_payments').select('amount,created_at').gte('created_at',`${from}T00:00:00`).lte('created_at',`${to}T23:59:59.999`)
    ])
    const error=c.error||e.error||p.error
    if(error)setMessage(error.message)
    else{
      setCategories((c.data as ExpenseCategory[])||[])
      setExpenses((e.data as ExpenseRow[])||[])
      setPayments((p.data as PaymentRow[])||[])
    }
  },[from,to])

  useEffect(()=>{void load()},[load])

  const stats=useMemo(()=>{
    const omzet=payments.reduce((sum,p)=>sum+Number(p.amount||0),0)
    const expense=expenses.reduce((sum,e)=>sum+Number(e.amount||0),0)
    return{omzet,expense,net:omzet-expense,margin:omzet>0?((omzet-expense)/omzet)*100:0}
  },[payments,expenses])

  const filtered=useMemo(()=>{
    const key=query.toLowerCase().trim()
    if(!key)return expenses
    return expenses.filter(e=>`${e.category_name} ${e.group_name||''} ${e.description||''} ${e.reference||''}`.toLowerCase().includes(key))
  },[expenses,query])

  const grouped=useMemo(()=>{
    const map:Record<string,number>={}
    for(const e of expenses)map[e.category_name]=(map[e.category_name]||0)+Number(e.amount||0)
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,10)
  },[expenses])

  const save=async(event:FormEvent)=>{
    event.preventDefault()
    const category=categories.find(c=>c.id===form.category_id)
    if(!category){setMessage('Pilih kategori pengeluaran.');return}
    if(Number(form.amount)<=0){setMessage('Nominal harus lebih dari 0.');return}
    setBusy(true);setMessage('')
    const {error}=await supabase.from('v106_expenses').insert({
      expense_date:form.expense_date,
      category_id:category.id,
      category_name:category.name,
      amount:Number(form.amount),
      payment_method:form.payment_method,
      description:form.description.trim()||null,
      reference:form.reference.trim()||null
    })
    if(error)setMessage(error.message)
    else{
      setOpen(false)
      setForm({expense_date:today(),category_id:'',amount:'',payment_method:'cash',description:'',reference:''})
      await load()
    }
    setBusy(false)
  }

  const exportCSV=()=>{
    const rows=[
      ['Tanggal','Kategori','Grup','Nominal','Metode','Keterangan','Referensi'],
      ...filtered.map(e=>[e.expense_date,e.category_name,e.group_name||'',e.amount,e.payment_method,e.description||'',e.reference||''])
    ]
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a')
    a.href=url
    a.download=`pengeluaran-${from}-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return <>
    <PageHeader
      eyebrow="FINANCE & ACCOUNTING"
      title="Keuangan"
      description="Input pengeluaran operasional dan pantau laba bersih berdasarkan pembayaran aktual."
      action={<div className="finance-actions">
        <button className="secondary-button" onClick={exportCSV}><FileSpreadsheet size={17}/>Export CSV</button>
        <button className="primary-button" onClick={()=>setOpen(true)}><Plus size={17}/>Tambah Pengeluaran</button>
      </div>}
    />

    <section className="panel finance-filter">
      <label>Dari<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Sampai<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <div><CalendarDays size={18}/><span>Periode laporan keuangan</span></div>
    </section>

    <section className="stats-grid finance-stats">
      <StatCard icon={TrendingUp} label="Pemasukan" value={formatRupiah(stats.omzet)} caption={`${payments.length} pembayaran`}/>
      <StatCard icon={TrendingDown} label="Pengeluaran" value={formatRupiah(stats.expense)} caption={`${expenses.length} transaksi`}/>
      <StatCard icon={WalletCards} label="Laba Bersih" value={formatRupiah(stats.net)} caption="Pemasukan - pengeluaran"/>
      <StatCard icon={ReceiptText} label="Margin" value={`${stats.margin.toFixed(1)}%`} caption="Margin laba bersih"/>
    </section>

    <section className="finance-grid">
      <article className="panel data-panel">
        <div className="toolbar">
          <label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari kategori atau keterangan"/></label>
          <span className="record-count">{filtered.length} pengeluaran</span>
        </div>
        {message&&<div className="error-box inline-message">{message}</div>}
        <div className="table-wrap"><table>
          <thead><tr><th>Tanggal</th><th>Kategori</th><th>Grup</th><th>Keterangan</th><th>Metode</th><th>Nominal</th></tr></thead>
          <tbody>
            {filtered.map(row=><tr key={row.id}>
              <td>{new Date(`${row.expense_date}T00:00:00`).toLocaleDateString('id-ID')}</td>
              <td><b>{row.category_name}</b></td>
              <td>{row.group_name||'-'}</td>
              <td>{row.description||'-'}{row.reference&&<small className="table-sub">Ref: {row.reference}</small>}</td>
              <td>{row.payment_method.toUpperCase()}</td>
              <td><b>{formatRupiah(Number(row.amount))}</b></td>
            </tr>)}
            {filtered.length===0&&<tr><td colSpan={6} className="table-empty">Belum ada pengeluaran di periode ini.</td></tr>}
          </tbody>
        </table></div>
      </article>

      <article className="panel finance-category-card">
        <h3>Pengeluaran Terbesar</h3>
        <p>Berdasarkan kategori pada periode terpilih.</p>
        <div className="finance-category-list">
          {grouped.map(([name,value],index)=><div key={name}>
            <span>{index+1}</span><div><b>{name}</b><small>{formatRupiah(value)}</small></div>
          </div>)}
          {grouped.length===0&&<div className="table-empty">Belum ada data.</div>}
        </div>
      </article>
    </section>

    {open&&<Modal title="Tambah Pengeluaran" onClose={()=>setOpen(false)}>
      <form className="modal-form" onSubmit={save}>
        <div className="form-grid-two">
          <label>Tanggal<input type="date" value={form.expense_date} onChange={e=>setForm({...form,expense_date:e.target.value})} required/></label>
          <label>Kategori<select value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})} required>
            <option value="">Pilih kategori</option>
            {Array.from(new Set(categories.map(c=>c.group_name))).map(group=><optgroup key={group} label={group}>
              {categories.filter(c=>c.group_name===group).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>)}
          </select></label>
        </div>
        <div className="form-grid-two">
          <label>Nominal<input type="number" min="1" step="1" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required/></label>
          <label>Metode Pembayaran<select value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}>
            <option value="cash">Tunai</option><option value="qris">QRIS</option><option value="transfer">Transfer</option><option value="bank">Bank</option><option value="other">Lainnya</option>
          </select></label>
        </div>
        <label>Keterangan<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Contoh: Gaji Agustus"/></label>
        <label>Referensi<input value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} placeholder="No. invoice / struk / slip"/></label>
        {message&&<div className="error-box">{message}</div>}
        <div className="form-actions"><button type="button" className="secondary-button" onClick={()=>setOpen(false)}>Batal</button><button className="primary-button" disabled={busy}>{busy?'Menyimpan...':'Simpan Pengeluaran'}</button></div>
      </form>
    </Modal>}
  </>
}
