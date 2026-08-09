import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, FileSpreadsheet, FileText, Search, TrendingDown, WalletCards } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatRupiah } from '../lib/format'
import { downloadXls, printPdf } from '../lib/exportData'
import { supabase } from '../lib/supabase'
import { loadPayrollExpenseRows, type PayrollExpenseRow } from '../lib/payrollExpense'

interface ExpenseRow{
  id:string
  expense_date:string
  category_name:string
  group_name:string|null
  amount:number
  payment_method:string
  description:string|null
  reference:string|null
  created_at:string
  proof_path?:string|null
  proof_name?:string|null
}

export function ExpenseDetailsPage(){
  const [rows,setRows]=useState<ExpenseRow[]>([])
  const [payrollRows,setPayrollRows]=useState<PayrollExpenseRow[]>([])
  const [query,setQuery]=useState('')
  const [from,setFrom]=useState(()=>{
    const d=new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
  })
  const [to,setTo]=useState(()=>new Date().toISOString().slice(0,10))
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const [expenseResult,payrollResult]=await Promise.allSettled([
      supabase
        .from('v106_expenses_view')
        .select('*')
        .gte('expense_date',from)
        .lte('expense_date',to)
        .order('expense_date',{ascending:false}),
      loadPayrollExpenseRows(from,to)
    ])
    if(expenseResult.status==='rejected'){
      setMessage(String(expenseResult.reason||'Gagal memuat pengeluaran.'))
    }else if(expenseResult.value.error){
      setMessage(expenseResult.value.error.message)
    }else{
      setRows((expenseResult.value.data as ExpenseRow[])||[])
    }
    if(payrollResult.status==='rejected'){
      setMessage(current=>current||`Gaji belum dapat dimuat: ${String(payrollResult.reason||'error')}`)
      setPayrollRows([])
    }else{
      setPayrollRows(payrollResult.value)
    }
    setLoading(false)
  },[from,to])

  useEffect(()=>{void load()},[load])

  const allRows=useMemo(()=>
    [...rows,...payrollRows].sort((a,b)=>b.expense_date.localeCompare(a.expense_date))
  ,[rows,payrollRows])

  const filtered=useMemo(()=>{
    const key=query.toLowerCase().trim()
    if(!key)return allRows
    return allRows.filter(r=>
      `${r.category_name} ${r.group_name||''} ${r.description||''} ${r.reference||''} ${r.payment_method}`.toLowerCase().includes(key)
    )
  },[allRows,query])

  const viewProof=async(row:ExpenseRow|PayrollExpenseRow)=>{
    const proofPath='proof_path' in row?row.proof_path:null
    if(!proofPath)return
    const {data,error}=await supabase.storage.from('expense-proofs').createSignedUrl(proofPath,300)
    if(error){setMessage(error.message);return}
    window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }

  const exportRows=useMemo(()=>filtered.map(r=>[
    new Date(`${r.expense_date}T00:00:00`).toLocaleDateString('id-ID'),
    r.category_name,
    r.group_name||'-',
    r.description||'-',
    r.reference||'-',
    r.payment_method.toUpperCase(),
    Number(r.amount||0)
  ]),[filtered])

  const exportOptions=()=>({
    title:'Daftar Pengeluaran',
    filename:`pengeluaran-${from}-${to}`,
    subtitle:`Periode ${from} s/d ${to}`,
    headers:['Tanggal','Kategori','Grup','Keterangan','Referensi','Metode','Nominal'],
    rows:exportRows,
    summary:[
      ['Jumlah Transaksi',filtered.length],
      ['Total Pengeluaran',filtered.reduce((sum,r)=>sum+Number(r.amount||0),0)]
    ] as Array<[string,string|number]>
  })

  const total=allRows.reduce((sum,r)=>sum+Number(r.amount||0),0)
  const operationalTotal=rows.reduce((sum,r)=>sum+Number(r.amount||0),0)
  const payrollTotal=payrollRows.reduce((sum,r)=>sum+Number(r.amount||0),0)
  const avg=allRows.length?total/allRows.length:0

  return <>
    <PageHeader
      eyebrow="FINANCE & ACCOUNTING"
      title="Daftar Pengeluaran"
      description="Rincian biaya operasional, gaji, pajak, laundry, kendaraan, marketing, dan lainnya."
      action={<div className="export-actions">
        <button className="secondary-button" onClick={()=>downloadXls(exportOptions())}><FileSpreadsheet size={16}/>XLS</button>
        <button className="secondary-button" onClick={()=>printPdf(exportOptions())}><FileText size={16}/>PDF</button>
      </div>}
    />

    <section className="panel finance-filter">
      <label>Dari<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Sampai<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <div><span>Periode daftar pengeluaran</span></div>
    </section>

    <section className="stats-grid finance-detail-stats">
      <StatCard icon={TrendingDown} label="Total Pengeluaran" value={formatRupiah(total)} caption={`Operasional ${formatRupiah(operationalTotal)} + Gaji ${formatRupiah(payrollTotal)}`}/>
      <StatCard icon={WalletCards} label="Jumlah Biaya" value={String(allRows.length)} caption={`${rows.length} operasional + ${payrollRows.length} gaji`}/>
      <StatCard icon={TrendingDown} label="Rata-rata Pengeluaran" value={formatRupiah(avg)} caption="Rata-rata biaya termasuk gaji"/>
    </section>

    <section className="panel data-panel">
      <div className="toolbar">
        <label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari kategori, keterangan, referensi, atau metode"/></label>
        <span className="record-count">{filtered.length} pengeluaran</span>
      </div>
      {message&&<div className="error-box inline-message">{message}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Tanggal</th><th>Kategori</th><th>Grup</th><th>Keterangan</th><th>Metode</th><th>Bukti</th><th>Nominal</th></tr></thead>
          <tbody>
            {loading&&<tr><td colSpan={7} className="table-empty">Memuat pengeluaran...</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={7} className="table-empty">Belum ada pengeluaran di periode ini.</td></tr>}
            {filtered.map(r=><tr key={r.id}>
              <td>{new Date(`${r.expense_date}T00:00:00`).toLocaleDateString('id-ID')}</td>
              <td><b>{r.category_name}</b></td>
              <td>{r.group_name||'-'}</td>
              <td>{r.description||'-'}{r.reference&&<small className="table-sub">Ref: {r.reference}</small>}</td>
              <td><span className={`badge ${r.payment_method==='payroll'?'payroll-expense-badge':''}`}>{r.payment_method==='payroll'?'GAJI':r.payment_method.toUpperCase()}</span></td>
              <td>{'proof_path' in r&&r.proof_path
                ? <button type="button" className="expense-proof-view" onClick={()=>void viewProof(r)}><Eye size={14}/>Lihat Bukti</button>
                : <span className="expense-proof-empty">-</span>}</td>
              <td><b className="expense-amount">{formatRupiah(Number(r.amount))}</b></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
  </>
}
