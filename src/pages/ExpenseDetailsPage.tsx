import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Eye, FileSpreadsheet, FileText, Pencil, Save, Search, Trash2, TrendingDown, WalletCards } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatRupiah } from '../lib/format'
import { downloadXls, printPdf } from '../lib/exportData'
import { supabase } from '../lib/supabase'
import { loadPayrollExpenseRows, type PayrollExpenseRow } from '../lib/payrollExpense'
import { useAuth } from '../lib/auth'
import { ownerDeleteDirect, removeDeleteFiles, requestDelete } from '../lib/deleteApproval'

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
  proof_path?:string|null
  proof_name?:string|null
}

export function ExpenseDetailsPage(){
  const {profile}=useAuth()
  const isOwner=profile?.role==='owner'
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
  const [deleteExpense,setDeleteExpense]=useState<ExpenseRow|null>(null)
  const [deleteReason,setDeleteReason]=useState('')
  const [deletePhrase,setDeletePhrase]=useState('')
  const [deleteBusy,setDeleteBusy]=useState(false)
  const [categories,setCategories]=useState<ExpenseCategory[]>([])
  const [editExpense,setEditExpense]=useState<ExpenseRow|null>(null)
  const [editBusy,setEditBusy]=useState(false)
  const [editForm,setEditForm]=useState({
    expense_date:'',category_id:'',amount:'',payment_method:'cash',
    description:'',reference:''
  })

  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const [expenseResult,payrollResult,categoryResult]=await Promise.allSettled([
      supabase
        .from('v106_expenses_view')
        .select('*')
        .gte('expense_date',from)
        .lte('expense_date',to)
        .order('expense_date',{ascending:false}),
      loadPayrollExpenseRows(from,to),
      supabase
        .from('v106_expense_categories')
        .select('id,name,group_name')
        .eq('is_active',true)
        .order('group_name')
        .order('name')
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
    if(categoryResult.status==='rejected'){
      setCategories([])
    }else{
      const categoryResponse=categoryResult.value
      if(categoryResponse.error){
        setMessage(current=>current||categoryResponse.error.message)
        setCategories([])
      }else{
        setCategories((categoryResponse.data as ExpenseCategory[])||[])
      }
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

  const openEditExpense=(row:ExpenseRow)=>{
    setEditExpense(row)
    setEditForm({
      expense_date:row.expense_date,
      category_id:row.category_id||'',
      amount:String(Number(row.amount||0)),
      payment_method:row.payment_method||'cash',
      description:row.description||'',
      reference:row.reference||''
    })
    setMessage('')
  }

  const saveEditExpense=async()=>{
    if(!editExpense)return
    const category=categories.find(item=>item.id===editForm.category_id)
    if(!category){setMessage('Pilih kategori pengeluaran.');return}
    const amount=Number(editForm.amount)
    if(!Number.isFinite(amount)||amount<=0){setMessage('Nominal harus lebih dari 0.');return}

    setEditBusy(true);setMessage('')
    try{
      const{error}=await supabase
        .from('v106_expenses')
        .update({
          expense_date:editForm.expense_date,
          category_id:category.id,
          category_name:category.name,
          amount,
          payment_method:editForm.payment_method,
          description:editForm.description.trim()||null,
          reference:editForm.reference.trim()||null
        })
        .eq('id',editExpense.id)
      if(error)throw error

      setEditExpense(null)
      await load()
    }catch(error){
      setMessage(error instanceof Error?error.message:'Gagal mengubah pengeluaran.')
    }finally{
      setEditBusy(false)
    }
  }

  const submitDeleteExpense=async()=>{
    if(!deleteExpense)return
    if(deleteReason.trim().length<5){setMessage('Alasan penghapusan minimal 5 karakter.');return}
    if(isOwner&&deletePhrase!=='HAPUS PENGELUARAN'){
      setMessage('Owner harus mengetik HAPUS PENGELUARAN.')
      return
    }
    setDeleteBusy(true);setMessage('')
    try{
      if(isOwner){
        const {data,error}=await ownerDeleteDirect('expense',deleteExpense.id,deleteReason.trim())
        if(error)throw error
        await removeDeleteFiles(data)
      }else{
        const {error}=await requestDelete('expense',deleteExpense.id,deleteReason.trim())
        if(error)throw error
        window.dispatchEvent(new Event('happylaundry-delete-requests-changed'))
      }
      setDeleteExpense(null);setDeleteReason('');setDeletePhrase('')
      await load()
    }catch(error){setMessage(error instanceof Error?error.message:'Permintaan hapus gagal.')}
    finally{setDeleteBusy(false)}
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

    <section className="panel data-panel finance-expense-list-panel">
      <div className="toolbar finance-expense-list-toolbar">
        <label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari kategori, keterangan, referensi, atau metode"/></label>
        <span className="record-count">{filtered.length} pengeluaran</span>
      </div>
      {message&&<div className="error-box inline-message">{message}</div>}
      <div className="table-wrap finance-expense-list-scroll">
        <table className="finance-expense-list-table">
          <thead><tr><th>Tanggal</th><th>Kategori</th><th>Grup</th><th>Keterangan</th><th>Metode</th><th>Bukti</th><th>Nominal</th><th>Aksi</th></tr></thead>
          <tbody>
            {loading&&<tr><td colSpan={8} className="table-empty">Memuat pengeluaran...</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={8} className="table-empty">Belum ada pengeluaran di periode ini.</td></tr>}
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
              <td>{r.payment_method!=='payroll'
                ? <div className="expense-row-actions">
                    <button type="button" className="expense-edit-button" onClick={()=>openEditExpense(r as ExpenseRow)}><Pencil size={14}/><span>Edit</span></button>
                    <button type="button" className="expense-delete-request" onClick={()=>{setDeleteExpense(r as ExpenseRow);setDeleteReason('');setDeletePhrase('')}}><Trash2 size={14}/><span className="delete-label">{isOwner?'Hapus':'Ajukan Hapus'}</span></button>
                  </div>
                : <span className="expense-proof-empty">-</span>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {editExpense&&<Modal title="Edit Pengeluaran" onClose={()=>setEditExpense(null)}>
      <div className="modal-form expense-edit-form">
        <div className="expense-edit-note">
          <Pencil size={19}/>
          <div><b>Koreksi pengeluaran</b><span>Ubah data yang salah lalu simpan. Bukti nota yang sudah ada tetap dipertahankan.</span></div>
        </div>

        <div className="form-grid-two">
          <label>Tanggal
            <input type="date" value={editForm.expense_date} onChange={e=>setEditForm({...editForm,expense_date:e.target.value})}/>
          </label>
          <label>Kategori
            <select value={editForm.category_id} onChange={e=>setEditForm({...editForm,category_id:e.target.value})}>
              <option value="">Pilih kategori</option>
              {categories.map(category=><option key={category.id} value={category.id}>{category.group_name} — {category.name}</option>)}
            </select>
          </label>
        </div>

        <div className="form-grid-two">
          <label>Nominal
            <input type="number" min="1" step="1" value={editForm.amount} onChange={e=>setEditForm({...editForm,amount:e.target.value})}/>
          </label>
          <label>Metode
            <select value={editForm.payment_method} onChange={e=>setEditForm({...editForm,payment_method:e.target.value})}>
              <option value="cash">Tunai</option>
              <option value="transfer">Transfer</option>
              <option value="qris">QRIS</option>
              <option value="other">Lainnya</option>
            </select>
          </label>
        </div>

        <label>Keterangan
          <textarea rows={3} value={editForm.description} onChange={e=>setEditForm({...editForm,description:e.target.value})}/>
        </label>
        <label>Referensi
          <input value={editForm.reference} onChange={e=>setEditForm({...editForm,reference:e.target.value})}/>
        </label>

        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={()=>setEditExpense(null)}>Batal</button>
          <button type="button" className="primary-button" disabled={editBusy} onClick={()=>void saveEditExpense()}>
            <Save size={15}/>{editBusy?'Menyimpan...':'Simpan Perubahan'}
          </button>
        </div>
      </div>
    </Modal>}

    {deleteExpense&&<Modal title={`${isOwner?'Hapus':'Ajukan Hapus'} Pengeluaran`} onClose={()=>setDeleteExpense(null)}>
      <div className="modal-form delete-request-form">
        <div className="delete-request-warning"><AlertTriangle size={20}/><div>
          <b>{isOwner?'Penghapusan permanen':'Menunggu persetujuan Owner'}</b>
          <span>{isOwner?'Data akan dihapus setelah konfirmasi kuat.':'Pengeluaran tetap ada sampai Owner menyetujui.'}</span>
        </div></div>
        <div className="delete-expense-summary"><span>{deleteExpense.category_name}</span><b>{formatRupiah(Number(deleteExpense.amount))}</b></div>
        <label>Alasan Penghapusan<textarea rows={3} value={deleteReason} onChange={e=>setDeleteReason(e.target.value)}/></label>
        {isOwner&&<label>Konfirmasi Owner<input value={deletePhrase} onChange={e=>setDeletePhrase(e.target.value)} placeholder="Ketik HAPUS PENGELUARAN"/></label>}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={()=>setDeleteExpense(null)}>Batal</button>
          <button type="button" className={isOwner?'danger-button':'primary-button'} disabled={deleteBusy} onClick={()=>void submitDeleteExpense()}><Trash2 size={15}/>{isOwner?'Hapus Pengeluaran':'Kirim ke Owner'}</button>
        </div>
      </div>
    </Modal>}
  </>
}
