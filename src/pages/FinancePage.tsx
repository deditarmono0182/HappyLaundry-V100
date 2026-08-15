import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, CalendarDays, Eye, FileSpreadsheet, FileText, ImageUp, Percent, Plus,
  ReceiptText, Search, Settings2, Trash2, TrendingDown, TrendingUp, WalletCards
} from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { useAuth } from '../lib/auth'
import { formatRupiah } from '../lib/format'
import { downloadXls, printPdf } from '../lib/exportData'
import { supabase } from '../lib/supabase'
import { loadPayrollExpenseRows, type PayrollExpenseRow } from '../lib/payrollExpense'
import { businessDateKey, businessMonthStartKey } from '../lib/businessTime'
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

interface OrderSummary{
  id:string
  total:number
  paid_amount:number
  status:string
}

interface PaymentRow{
  id:string
  order_id:string
  amount:number
  created_at:string
}

interface OrderItemRow{
  order_id:string
  service_id:string|null
  subtotal:number
}

interface ServiceRow{
  id:string
  category:string
}

interface RevenueShareSetting{
  id?:string
  category:string
  share_percent:number
}

const today=()=>businessDateKey()
const monthStart=()=>businessMonthStartKey()

export function FinancePage(){
  const navigate=useNavigate()
  const{profile}=useAuth()
  const isOwner=profile?.role==='owner'

  const [categories,setCategories]=useState<ExpenseCategory[]>([])
  const [expenses,setExpenses]=useState<ExpenseRow[]>([])
  const [payrollExpenses,setPayrollExpenses]=useState<PayrollExpenseRow[]>([])
  const [payments,setPayments]=useState<PaymentRow[]>([])
  const [orders,setOrders]=useState<OrderSummary[]>([])
  const [orderItems,setOrderItems]=useState<OrderItemRow[]>([])
  const [services,setServices]=useState<ServiceRow[]>([])
  const [shareSettings,setShareSettings]=useState<RevenueShareSetting[]>([])

  const [from,setFrom]=useState(monthStart())
  const [to,setTo]=useState(today())
  const [query,setQuery]=useState('')
  const [open,setOpen]=useState(false)
  const [shareOpen,setShareOpen]=useState(false)
  const [shareDraft,setShareDraft]=useState<Record<string,string>>({})
  const [busy,setBusy]=useState(false)
  const [shareBusy,setShareBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [shareMessage,setShareMessage]=useState('')
  const [proofFile,setProofFile]=useState<File|null>(null)
  const [proofPreview,setProofPreview]=useState('')
  const [deleteExpense,setDeleteExpense]=useState<ExpenseRow|null>(null)
  const [deleteReason,setDeleteReason]=useState('')
  const [deletePhrase,setDeletePhrase]=useState('')
  const [deleteBusy,setDeleteBusy]=useState(false)

  const [form,setForm]=useState({
    expense_date:today(),category_id:'',amount:'',payment_method:'cash',
    description:'',reference:''
  })

  const load=useCallback(async()=>{
    setMessage('')
    const [c,e,p,o,i,s,rs]=await Promise.all([
      supabase.from('v106_expense_categories').select('*').eq('is_active',true).order('group_name').order('name'),
      supabase.from('v106_expenses_view').select('*').gte('expense_date',from).lte('expense_date',to).order('expense_date',{ascending:false}),
      supabase.from('v100_payments').select('id,order_id,amount,created_at').gte('created_at',`${from}T00:00:00`).lte('created_at',`${to}T23:59:59.999`),
      supabase.from('v100_orders_view').select('id,total,paid_amount,status'),
      supabase.from('v100_order_items').select('order_id,service_id,subtotal'),
      supabase.from('v100_services').select('id,category'),
      isOwner
        ? supabase.from('v110_revenue_share_settings').select('id,category,share_percent').order('category')
        : Promise.resolve({data:[] as RevenueShareSetting[],error:null})
    ])

    const error=c.error||e.error||p.error||o.error||i.error||s.error||rs.error
    if(error)setMessage(error.message)
    else{
      setCategories((c.data as ExpenseCategory[])||[])
      setExpenses((e.data as ExpenseRow[])||[])
      setPayments((p.data as PaymentRow[])||[])
      setOrders((o.data as OrderSummary[])||[])
      setOrderItems((i.data as OrderItemRow[])||[])
      setServices((s.data as ServiceRow[])||[])
      setShareSettings((rs.data as RevenueShareSetting[])||[])
      try{
        setPayrollExpenses(await loadPayrollExpenseRows(from,to))
      }catch(payrollError){
        setPayrollExpenses([])
        setMessage(`Data operasional berhasil dimuat, tetapi gaji belum dapat dihitung: ${payrollError instanceof Error?payrollError.message:String(payrollError)}`)
      }
    }
  },[from,to])

  useEffect(()=>{void load()},[load])

  const allExpenses=useMemo(()=>
    [...expenses,...payrollExpenses].sort((a,b)=>b.expense_date.localeCompare(a.expense_date))
  ,[expenses,payrollExpenses])

  const stats=useMemo(()=>{
    const omzet=payments.reduce((sum,p)=>sum+Number(p.amount||0),0)
    const expense=allExpenses.reduce((sum,e)=>sum+Number(e.amount||0),0)
    const receivable=orders
      .filter(o=>o.status!=='cancelled')
      .reduce((sum,o)=>sum+Math.max(0,Number(o.total||0)-Number(o.paid_amount||0)),0)
    const receivableCount=orders.filter(o=>o.status!=='cancelled'&&Math.max(0,Number(o.total||0)-Number(o.paid_amount||0))>0).length
    return{
      omzet,expense,net:omzet-expense,
      margin:omzet>0?((omzet-expense)/omzet)*100:0,
      receivable,receivableCount
    }
  },[payments,allExpenses,orders])

  const filtered=useMemo(()=>{
    const key=query.toLowerCase().trim()
    if(!key)return allExpenses
    return allExpenses.filter(e=>`${e.category_name} ${e.group_name||''} ${e.description||''} ${e.reference||''}`.toLowerCase().includes(key))
  },[allExpenses,query])

  const grouped=useMemo(()=>{
    const map:Record<string,number>={}
    for(const e of allExpenses)map[e.category_name]=(map[e.category_name]||0)+Number(e.amount||0)
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,10)
  },[allExpenses])

  const revenueSharing=useMemo(()=>{
    const serviceCategory=new Map(services.map(service=>[
      service.id,(service.category||'Reguler').trim()||'Reguler'
    ]))

    const itemsByOrder=new Map<string,OrderItemRow[]>()
    for(const item of orderItems){
      const list=itemsByOrder.get(item.order_id)||[]
      list.push(item)
      itemsByOrder.set(item.order_id,list)
    }

    const groupedRevenue:Record<string,number>={}

    // Allocate each ACTUAL payment in the selected date range
    // proportionally across the order's item subtotals.
    for(const payment of payments){
      const items=itemsByOrder.get(payment.order_id)||[]
      const itemTotal=items.reduce((sum,item)=>sum+Math.max(0,Number(item.subtotal||0)),0)
      const paymentAmount=Math.max(0,Number(payment.amount||0))

      if(paymentAmount<=0)continue

      if(items.length===0||itemTotal<=0){
        groupedRevenue['Reguler']=(groupedRevenue['Reguler']||0)+paymentAmount
        continue
      }

      for(const item of items){
        const subtotal=Math.max(0,Number(item.subtotal||0))
        if(subtotal<=0)continue
        const category=item.service_id
          ? serviceCategory.get(item.service_id)||'Reguler'
          : 'Reguler'
        const allocated=paymentAmount*(subtotal/itemTotal)
        groupedRevenue[category]=(groupedRevenue[category]||0)+allocated
      }
    }

    const percentMap=new Map(
      shareSettings.map(setting=>[
        setting.category.toLowerCase(),
        Number(setting.share_percent||0)
      ])
    )

    const allCategories=Array.from(new Set([
      ...services.map(s=>(s.category||'Reguler').trim()||'Reguler'),
      ...shareSettings.map(s=>s.category),
      ...Object.keys(groupedRevenue)
    ])).sort((a,b)=>a.localeCompare(b,'id'))

    const rows=allCategories.map(category=>{
      const revenue=groupedRevenue[category]||0
      const sharePercent=percentMap.get(category.toLowerCase())||0
      const shareAmount=revenue*(sharePercent/100)
      return{category,revenue,sharePercent,shareAmount}
    }).sort((a,b)=>b.revenue-a.revenue)

    const totalRevenue=rows.reduce((sum,row)=>sum+row.revenue,0)
    const totalShare=rows.reduce((sum,row)=>sum+row.shareAmount,0)
    const remaining=totalRevenue-totalShare
    const effectivePercent=totalRevenue>0?(totalShare/totalRevenue)*100:0

    return{rows,totalRevenue,totalShare,remaining,effectivePercent}
  },[payments,orderItems,services,shareSettings])

  const revenueShareExportOptions=()=>({
    title:'Bagi Hasil per Kategori Layanan',
    filename:`bagi-hasil-${from}-${to}`,
    subtitle:`Periode ${from} s/d ${to}`,
    headers:['Kategori Layanan','Omzet','Persentase (%)','Nilai Bagi Hasil','Sisa Omzet'],
    rows:revenueSharing.rows.map(row=>[
      row.category,
      Math.round(row.revenue),
      row.sharePercent.toFixed(2),
      Math.round(row.shareAmount),
      Math.round(row.revenue-row.shareAmount)
    ]),
    summary:[
      ['Total Omzet',Math.round(revenueSharing.totalRevenue)],
      ['Total Bagi Hasil',Math.round(revenueSharing.totalShare)],
      ['Sisa Setelah Bagi Hasil',Math.round(revenueSharing.remaining)],
      ['Persentase Efektif',`${revenueSharing.effectivePercent.toFixed(2)}%`]
    ] as Array<[string,string|number]>
  })

  const openShareSettings=()=>{
    const draft:Record<string,string>={}
    for(const row of revenueSharing.rows)draft[row.category]=String(row.sharePercent)
    setShareDraft(draft)
    setShareMessage('')
    setShareOpen(true)
  }

  const saveShareSettings=async(event:FormEvent)=>{
    event.preventDefault()
    if(!isOwner){
      setShareMessage('Hanya Owner yang dapat mengubah persentase bagi hasil.')
      return
    }

    const payload=revenueSharing.rows.map(row=>{
      const raw=Number(shareDraft[row.category]??row.sharePercent)
      const percent=Math.max(0,Math.min(100,Number.isFinite(raw)?raw:0))
      return{
        category:row.category.trim(),
        share_percent:percent,
        updated_at:new Date().toISOString()
      }
    })

    setShareBusy(true);setShareMessage('')
    const{error}=await supabase
      .from('v110_revenue_share_settings')
      .upsert(payload,{onConflict:'category'})

    if(error){
      setShareMessage(error.message)
    }else{
      setShareOpen(false)
      await load()
    }
    setShareBusy(false)
  }

  const chooseExpenseProof=(file:File|null)=>{
    if(!file)return
    if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)){
      setMessage('Bukti pengeluaran harus JPG, PNG, WEBP, atau PDF.')
      return
    }
    if(file.size>5*1024*1024){
      setMessage('Ukuran bukti pengeluaran maksimal 5 MB.')
      return
    }
    setProofFile(file)
    setMessage('')
    if(proofPreview.startsWith('blob:'))URL.revokeObjectURL(proofPreview)
    setProofPreview(file.type==='application/pdf'?'':URL.createObjectURL(file))
  }

  const clearExpenseProof=()=>{
    if(proofPreview.startsWith('blob:'))URL.revokeObjectURL(proofPreview)
    setProofFile(null)
    setProofPreview('')
  }

  const viewExpenseProof=async(row:ExpenseRow|PayrollExpenseRow)=>{
    const proofPath='proof_path' in row?row.proof_path:null
    if(!proofPath)return
    const {data,error}=await supabase.storage.from('expense-proofs').createSignedUrl(proofPath,300)
    if(error){setMessage(error.message);return}
    window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }

  const save=async(event:FormEvent)=>{
    event.preventDefault()
    const category=categories.find(c=>c.id===form.category_id)
    if(!category){setMessage('Pilih kategori pengeluaran.');return}
    if(Number(form.amount)<=0){setMessage('Nominal harus lebih dari 0.');return}

    setBusy(true);setMessage('')
    let uploadedPath:string|null=null

    try{
      if(proofFile){
        const ext=(proofFile.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg'
        uploadedPath=`${form.expense_date}/${crypto.randomUUID()}.${ext}`
        const upload=await supabase.storage.from('expense-proofs').upload(uploadedPath,proofFile,{
          upsert:false,
          cacheControl:'3600',
          contentType:proofFile.type
        })
        if(upload.error)throw upload.error
      }

      const {error}=await supabase.from('v106_expenses').insert({
        expense_date:form.expense_date,
        category_id:category.id,
        category_name:category.name,
        amount:Number(form.amount),
        payment_method:form.payment_method,
        description:form.description.trim()||null,
        reference:form.reference.trim()||null,
        proof_path:uploadedPath,
        proof_name:proofFile?.name||null
      })
      if(error)throw error

      setOpen(false)
      setForm({expense_date:today(),category_id:'',amount:'',payment_method:'cash',description:'',reference:''})
      clearExpenseProof()
      await load()
    }catch(error){
      if(uploadedPath){
        try{await supabase.storage.from('expense-proofs').remove([uploadedPath])}catch{}
      }
      setMessage(error instanceof Error?error.message:'Gagal menyimpan pengeluaran.')
    }finally{
      setBusy(false)
    }
  }

  const submitDeleteExpense=async()=>{
    if(!deleteExpense)return
    if(deleteReason.trim().length<5){setMessage('Alasan penghapusan minimal 5 karakter.');return}
    if(isOwner&&deletePhrase!=='HAPUS PENGELUARAN'){
      setMessage('Owner harus mengetik HAPUS PENGELUARAN untuk menghapus langsung.')
      return
    }
    setDeleteBusy(true);setMessage('')
    try{
      if(isOwner){
        const {data,error}=await ownerDeleteDirect('expense',deleteExpense.id,deleteReason.trim())
        if(error)throw error
        await removeDeleteFiles(data)
        window.alert('Pengeluaran berhasil dihapus oleh Owner.')
      }else{
        const {error}=await requestDelete('expense',deleteExpense.id,deleteReason.trim())
        if(error)throw error
        window.dispatchEvent(new Event('happylaundry-delete-requests-changed'))
        window.alert('Permintaan hapus pengeluaran sudah dikirim ke Owner.')
      }
      setDeleteExpense(null);setDeleteReason('');setDeletePhrase('')
      await load()
    }catch(error){
      setMessage(error instanceof Error?error.message:'Permintaan hapus gagal.')
    }finally{setDeleteBusy(false)}
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
      description={isOwner
        ? "Pantau pemasukan, pengeluaran, piutang, laba bersih, dan bagi hasil per kategori layanan."
        : "Catat dan pantau pengeluaran operasional sesuai hak akses karyawan."}
      action={<div className="finance-actions">
        <button className="secondary-button" onClick={exportCSV}><FileSpreadsheet size={17}/>Export CSV</button>
        <button className="primary-button" onClick={()=>setOpen(true)}><Plus size={17}/>Tambah Pengeluaran</button>
      </div>}
    />

    {!isOwner&&<div className="employee-finance-note">
      <b>Akses Karyawan: Input Pengeluaran</b>
      <span>Anda dapat mencatat pengeluaran. Pengaturan Bagi Hasil hanya tersedia untuk Owner.</span>
    </div>}

    <section className="panel finance-filter">
      <label>Dari<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Sampai<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <div><CalendarDays size={18}/><span>{isOwner?'Periode laporan & bagi hasil':'Periode pengeluaran'}</span></div>
    </section>

    <section className="stats-grid finance-stats">
      <button type="button" className="finance-click-stat finance-income-click" onClick={()=>navigate('/finance/income')} title="Buka daftar pemasukan">
        <StatCard icon={TrendingUp} label="Pemasukan" value={formatRupiah(stats.omzet)} caption={`${payments.length} pembayaran • Klik untuk lihat`}/>
      </button>
      <button type="button" className="finance-click-stat finance-expense-click" onClick={()=>navigate('/finance/expenses')} title="Buka daftar pengeluaran">
        <StatCard icon={TrendingDown} label="Pengeluaran" value={formatRupiah(stats.expense)} caption={`${expenses.length} operasional + ${payrollExpenses.length} gaji • Klik untuk lihat`}/>
      </button>
      <StatCard icon={WalletCards} label="Laba Bersih" value={formatRupiah(stats.net)} caption="Pemasukan - pengeluaran"/>
      <button type="button" className="finance-click-stat" onClick={()=>navigate('/receivables')} title="Buka daftar piutang">
        <StatCard icon={AlertTriangle} label="Piutang" value={formatRupiah(stats.receivable)} caption={`${stats.receivableCount} order belum lunas • Klik untuk lihat`}/>
      </button>
      <StatCard icon={ReceiptText} label="Margin" value={`${stats.margin.toFixed(1)}%`} caption="Margin laba bersih"/>
    </section>

    {isOwner&&<>
    <section className="panel revenue-share-panel">
      <div className="revenue-share-heading">
        <div>
          <span className="eyebrow">REVENUE SHARING</span>
          <h3>Bagi Hasil per Kategori Layanan</h3>
          <p>Persentase diterapkan ke omzet pembayaran aktual pada periode yang dipilih.</p>
        </div>
        <div className="revenue-share-actions">
          <button type="button" className="secondary-button" onClick={()=>downloadXls(revenueShareExportOptions())}>
            <FileSpreadsheet size={16}/>XLS
          </button>
          <button type="button" className="secondary-button" onClick={()=>printPdf(revenueShareExportOptions())}>
            <FileText size={16}/>PDF
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={openShareSettings}
            disabled={!isOwner}
            title={isOwner?'Ubah persentase bagi hasil':'Hanya Owner yang dapat mengubah persentase'}
          >
            <Settings2 size={17}/>Atur Persentase
          </button>
        </div>
      </div>

      <div className="revenue-share-summary">
        <div>
          <span>Omzet Kategori</span>
          <strong>{formatRupiah(revenueSharing.totalRevenue)}</strong>
          <small>Pembayaran aktual periode ini</small>
        </div>
        <div className="share-total">
          <span>Total Bagi Hasil</span>
          <strong>{formatRupiah(revenueSharing.totalShare)}</strong>
          <small>Akumulasi seluruh kategori</small>
        </div>
        <div>
          <span>Sisa Setelah Bagi Hasil</span>
          <strong>{formatRupiah(revenueSharing.remaining)}</strong>
          <small>Omzet kategori - bagi hasil</small>
        </div>
        <div>
          <span>Persentase Efektif</span>
          <strong>{revenueSharing.effectivePercent.toFixed(2)}%</strong>
          <small>Terhadap total omzet kategori</small>
        </div>
      </div>

      <div className="table-wrap revenue-share-table">
        <table>
          <thead>
            <tr>
              <th>Kategori Layanan</th>
              <th>Omzet</th>
              <th>Persentase</th>
              <th>Nilai Bagi Hasil</th>
              <th>Sisa Omzet</th>
            </tr>
          </thead>
          <tbody>
            {revenueSharing.rows.map(row=><tr key={row.category}>
              <td><b>{row.category}</b></td>
              <td><b>{formatRupiah(row.revenue)}</b></td>
              <td><span className="share-percent-badge"><Percent size={13}/>{row.sharePercent.toFixed(2)}%</span></td>
              <td><b className="share-amount">{formatRupiah(row.shareAmount)}</b></td>
              <td>{formatRupiah(row.revenue-row.shareAmount)}</td>
            </tr>)}
            {revenueSharing.rows.length===0&&<tr><td colSpan={5} className="table-empty">Belum ada kategori layanan.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
    </>}

    <section className="finance-grid">
      <article className="panel data-panel">
        <div className="toolbar">
          <label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari kategori atau keterangan"/></label>
          <span className="record-count">{filtered.length} pengeluaran</span>
        </div>
        {message&&<div className="error-box inline-message">{message}</div>}
        <div className="table-wrap"><table>
          <thead><tr><th>Tanggal</th><th>Kategori</th><th>Grup</th><th>Keterangan</th><th>Metode</th><th>Bukti</th><th>Nominal</th><th>Aksi</th></tr></thead>
          <tbody>
            {filtered.map(row=><tr key={row.id}>
              <td>{new Date(`${row.expense_date}T00:00:00`).toLocaleDateString('id-ID')}</td>
              <td><b>{row.category_name}</b></td>
              <td>{row.group_name||'-'}</td>
              <td>{row.description||'-'}{row.reference&&<small className="table-sub">Ref: {row.reference}</small>}</td>
              <td><span className={row.payment_method==='payroll'?'payroll-expense-badge':''}>{row.payment_method==='payroll'?'GAJI':row.payment_method.toUpperCase()}</span></td>
              <td>{'proof_path' in row&&row.proof_path
                ? <button type="button" className="expense-proof-view" onClick={()=>void viewExpenseProof(row)}><Eye size={14}/>Lihat</button>
                : <span className="expense-proof-empty">-</span>}</td>
              <td><b>{formatRupiah(Number(row.amount))}</b></td>
              <td>{row.payment_method!=='payroll'
                ? <button type="button" className="expense-delete-request" onClick={()=>{setDeleteExpense(row as ExpenseRow);setDeleteReason('');setDeletePhrase('');setMessage('')}}>
                    <Trash2 size={14}/><span className="delete-label">{isOwner?'Hapus':'Ajukan Hapus'}</span>
                  </button>
                : <span className="expense-proof-empty">-</span>}</td>
            </tr>)}
            {filtered.length===0&&<tr><td colSpan={8} className="table-empty">Belum ada pengeluaran di periode ini.</td></tr>}
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

    {deleteExpense&&<Modal title={`${isOwner?'Hapus':'Ajukan Hapus'} Pengeluaran`} onClose={()=>setDeleteExpense(null)}>
      <div className="modal-form delete-request-form">
        <div className="delete-request-warning">
          <AlertTriangle size={20}/>
          <div><b>{isOwner?'Penghapusan permanen':'Memerlukan persetujuan Owner'}</b>
          <span>{isOwner?'Pengeluaran dan bukti nota terkait akan dihapus.':'Data tetap ada sampai Owner menyetujui.'}</span></div>
        </div>
        <div className="delete-expense-summary"><span>{deleteExpense.category_name}</span><b>{formatRupiah(Number(deleteExpense.amount))}</b></div>
        <label>Alasan Penghapusan<textarea rows={3} value={deleteReason} onChange={e=>setDeleteReason(e.target.value)} placeholder="Contoh: salah nominal / duplikat"/></label>
        {isOwner&&<label>Konfirmasi Owner<input value={deletePhrase} onChange={e=>setDeletePhrase(e.target.value)} placeholder="Ketik HAPUS PENGELUARAN"/></label>}
        {message&&<div className="error-box">{message}</div>}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={()=>setDeleteExpense(null)}>Batal</button>
          <button type="button" className={isOwner?'danger-button':'primary-button'} disabled={deleteBusy} onClick={()=>void submitDeleteExpense()}>
            <Trash2 size={15}/>{deleteBusy?'Memproses...':isOwner?'Hapus Pengeluaran':'Kirim ke Owner'}
          </button>
        </div>
      </div>
    </Modal>}

    {isOwner&&shareOpen&&<Modal title="Atur Persentase Bagi Hasil" onClose={()=>setShareOpen(false)}>
      <form className="modal-form share-settings-form" onSubmit={saveShareSettings}>
        <div className="share-settings-note">
          <Percent size={20}/>
          <div>
            <b>Persentase per kategori layanan</b>
            <span>Nilai dapat diubah kapan saja oleh Owner. Rentang 0% sampai 100%.</span>
          </div>
        </div>

        <div className="share-settings-list">
          {revenueSharing.rows.map(row=><label key={row.category}>
            <span><b>{row.category}</b><small>Omzet saat ini {formatRupiah(row.revenue)}</small></span>
            <div className="share-percent-input">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={shareDraft[row.category]??String(row.sharePercent)}
                onChange={e=>setShareDraft({...shareDraft,[row.category]:e.target.value})}
              />
              <span>%</span>
            </div>
          </label>)}
        </div>

        {shareMessage&&<div className="error-box">{shareMessage}</div>}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={()=>setShareOpen(false)}>Batal</button>
          <button className="primary-button" disabled={shareBusy}>{shareBusy?'Menyimpan...':'Simpan Persentase'}</button>
        </div>
      </form>
    </Modal>}

    {open&&<Modal title="Tambah Pengeluaran" onClose={()=>{setOpen(false);clearExpenseProof()}}>
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

        <div className="expense-proof-section">
          <span className="expense-proof-label">Nota / Bukti Pengeluaran</span>
          <label className="expense-proof-upload">
            <ImageUp size={22}/>
            <span>
              <b>{proofFile?'Ganti Bukti':'Upload / Foto Nota'}</b>
              <small>JPG, PNG, WEBP, PDF • maksimal 5 MB</small>
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              onChange={e=>chooseExpenseProof(e.target.files?.[0]||null)}
            />
          </label>
          {proofFile&&<div className="expense-proof-selected">
            {proofPreview
              ? <img src={proofPreview} alt="Preview nota pengeluaran"/>
              : <FileText size={30}/>}
            <span><b>{proofFile.name}</b><small>{(proofFile.size/1024).toFixed(0)} KB</small></span>
            <button type="button" onClick={clearExpenseProof}>Hapus</button>
          </div>}
          <small className="expense-proof-help">Opsional, tetapi disarankan untuk audit pengeluaran.</small>
        </div>

        {message&&<div className="error-box">{message}</div>}
        <div className="form-actions"><button type="button" className="secondary-button" onClick={()=>{setOpen(false);clearExpenseProof()}}>Batal</button><button className="primary-button" disabled={busy}>{busy?'Menyimpan...':'Simpan Pengeluaran'}</button></div>
      </form>
    </Modal>}
  </>
}
