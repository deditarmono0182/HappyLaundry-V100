import { useCallback, useEffect, useMemo, useState } from 'react'
import { CreditCard, Eye, FileSpreadsheet, FileText, MessageCircle, ReceiptText, Search, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatIDR } from '../lib/format'
import { downloadXls, printPdf } from '../lib/exportData'
import { statusLabels } from '../lib/order'
import { supabase } from '../lib/supabase'
import type { OrderRow } from '../types/order'

export function ReceivablesPage(){
  const navigate=useNavigate()
  const [rows,setRows]=useState<OrderRow[]>([])
  const [query,setQuery]=useState('')
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const {data,error}=await supabase
      .from('v100_orders_view')
      .select('*')
      .order('created_at',{ascending:false})

    if(error){
      setMessage(error.message)
      setRows([])
    }else{
      setRows(((data as OrderRow[])||[]).filter(r=>
        r.status!=='cancelled' &&
        Math.max(0,Number(r.total||0)-Number(r.paid_amount||0))>0
      ))
    }
    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  const filtered=useMemo(()=>{
    const key=query.toLowerCase().trim()
    if(!key)return rows
    return rows.filter(r=>
      `${r.order_no} ${r.customer_name||''} ${r.customer_phone||''}`.toLowerCase().includes(key)
    )
  },[rows,query])

  const exportRows=useMemo(()=>filtered.map(row=>{
    const remaining=Math.max(0,Number(row.total)-Number(row.paid_amount))
    return[
      row.order_no,
      row.customer_name,
      row.customer_phone||'-',
      Number(row.total||0),
      Number(row.paid_amount||0),
      remaining,
      statusLabels[row.status],
      new Date(row.created_at).toLocaleDateString('id-ID')
    ]
  }),[filtered])

  const exportOptions=()=>({
    title:'Daftar Piutang',
    filename:`piutang-${new Date().toISOString().slice(0,10)}`,
    subtitle:'Order yang masih memiliki sisa tagihan',
    headers:['Order','Pelanggan','Telepon','Total','Sudah Bayar','Sisa Piutang','Status','Dibuat'],
    rows:exportRows,
    summary:[
      ['Order Belum Lunas',filtered.length],
      ['Total Piutang',filtered.reduce((sum,row)=>sum+Math.max(0,Number(row.total)-Number(row.paid_amount)),0)]
    ] as Array<[string,string|number]>
  })

  const totalReceivable=useMemo(
    ()=>rows.reduce((sum,r)=>sum+Math.max(0,Number(r.total||0)-Number(r.paid_amount||0)),0),
    [rows]
  )

  const avgReceivable=rows.length?totalReceivable/rows.length:0

  const openWA=(row:OrderRow)=>{
    const phone=(row.customer_phone||'').replace(/\D/g,'').replace(/^0/,'62')
    if(!phone)return
    const remaining=Math.max(0,Number(row.total)-Number(row.paid_amount))
    const tracking=`${window.location.origin}/track/${encodeURIComponent(row.order_no)}`
    const text=`Halo ${row.customer_name}, kami mengingatkan sisa pembayaran order ${row.order_no} sebesar ${formatIDR(remaining)}.\n\nCek status laundry:\n${tracking}\n\nTerima kasih.`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`,'_blank')
  }

  return <>
    <PageHeader
      eyebrow="FINANCE & ACCOUNTING"
      title="Daftar Piutang"
      description="Semua order yang masih memiliki sisa tagihan."
      action={<div className="export-actions">
        <button className="secondary-button" onClick={()=>downloadXls(exportOptions())}><FileSpreadsheet size={16}/>XLS</button>
        <button className="secondary-button" onClick={()=>printPdf(exportOptions())}><FileText size={16}/>PDF</button>
      </div>}
    />

    <section className="stats-grid receivable-stats">
      <StatCard icon={WalletCards} label="Total Piutang" value={formatIDR(totalReceivable)} caption="Sisa seluruh tagihan"/>
      <StatCard icon={ReceiptText} label="Order Belum Lunas" value={String(rows.length)} caption="Perlu ditagihkan"/>
      <StatCard icon={CreditCard} label="Rata-rata Piutang" value={formatIDR(avgReceivable)} caption="Rata-rata sisa per order"/>
    </section>

    <section className="panel data-panel">
      <div className="toolbar">
        <label className="search-box">
          <Search size={18}/>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari order, pelanggan, atau WhatsApp"/>
        </label>
        <span className="record-count">{filtered.length} piutang</span>
      </div>

      {message&&<div className="error-box inline-message">{message}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Pelanggan</th>
              <th>Total</th>
              <th>Sudah Bayar</th>
              <th>Sisa Piutang</th>
              <th>Status</th>
              <th>Dibuat</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={8} className="table-empty">Memuat daftar piutang...</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={8} className="table-empty">Tidak ada piutang. Semua order sudah lunas.</td></tr>}
            {filtered.map(row=>{
              const remaining=Math.max(0,Number(row.total)-Number(row.paid_amount))
              return <tr key={row.id}>
                <td><b>{row.order_no}</b></td>
                <td><b>{row.customer_name}</b><small>{row.customer_phone||'-'}</small></td>
                <td>{formatIDR(Number(row.total))}</td>
                <td>{formatIDR(Number(row.paid_amount))}</td>
                <td><b className="receivable-amount">{formatIDR(remaining)}</b></td>
                <td><span className={`badge status-${row.status}`}>{statusLabels[row.status]}</span></td>
                <td>{new Date(row.created_at).toLocaleDateString('id-ID')}</td>
                <td>
                  <div className="row-actions receivable-actions">
                    <button title="Bayar" className="receivable-pay" onClick={()=>navigate(`/payments?order=${encodeURIComponent(row.order_no)}`)}><CreditCard size={16}/></button>
                    <button title="Detail Order" onClick={()=>navigate(`/orders?order=${encodeURIComponent(row.order_no)}`)}><Eye size={16}/></button>
                    <button title="WhatsApp" className="receivable-wa" onClick={()=>openWA(row)}><MessageCircle size={16}/></button>
                  </div>
                </td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
    </section>
  </>
}
