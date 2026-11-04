import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CreditCard, Eye, FileSpreadsheet, FileText, MessageCircle, ReceiptText, Search, WalletCards } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatIDR } from '../lib/format'
import { downloadXls, printPdf } from '../lib/exportData'
import { statusLabels } from '../lib/order'
import {businessDateKey,businessDateLabel,addBusinessDays} from '../lib/businessTime'
import {loadReceivables,remainingReceivable,monthEndReceivable,type ReceivableRow} from '../lib/receivables'
import {loadOrderCustomerAddresses,type OrderCustomerAddress} from '../lib/orderCustomerAddress'
import {openOrderReceiptWhatsApp} from '../lib/orderReceipt'
import type { OrderRow } from '../types/order'

export function ReceivablesPage(){
  const navigate=useNavigate()
  const [rows,setRows]=useState<ReceivableRow[]>([])
  const [query,setQuery]=useState('')
  const [searchParams,setSearchParams]=useSearchParams()
  const requestedDate=searchParams.get('as_of')||''
  const asOf=/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)&&requestedDate<=businessDateKey()?requestedDate:null
  const setAsOf=(date:string|null)=>setSearchParams(previous=>{const next=new URLSearchParams(previous);if(date)next.set('as_of',date);else next.delete('as_of');return next},{replace:true})
  const [loadedKey,setLoadedKey]=useState<string|null>(null)
  const sequence=useRef(0)
  const today=businessDateKey()
  const reportKey=asOf||'current'
  const dateLabel=asOf?businessDateLabel(`${asOf}T12:00:00+07:00`,{day:'numeric',month:'long',year:'numeric'}):'saat ini'

  const [customerAddresses,setCustomerAddresses]=useState<OrderCustomerAddress[]>([])
  const customerAddressById=useMemo(()=>new Map(customerAddresses.map(c=>[c.id,c.address?.trim()||'Belum diisi'])),[customerAddresses])
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const ready=!loading&&loadedKey===reportKey

  const load=useCallback(async()=>{
    const request=++sequence.current
    setLoading(true);setLoadedKey(null);setMessage('');setRows([]);setCustomerAddresses([])
    try{
      const outstanding=await loadReceivables(asOf)
      if(request!==sequence.current)return
      setRows(outstanding);setLoadedKey(asOf||'current');setLoading(false)
      try{
        const addresses=await loadOrderCustomerAddresses(outstanding.map(row=>row.customer_id))
        if(request===sequence.current)setCustomerAddresses(addresses)
      }catch(error){
        if(request===sequence.current)setMessage(error instanceof Error?error.message:'Alamat pelanggan gagal dimuat.')
      }
    }catch(error){
      if(request===sequence.current){setMessage(error instanceof Error?error.message:'Daftar piutang gagal dimuat.');setRows([]);setLoading(false)}
    }
  },[asOf])

  useEffect(()=>{void load();return()=>{sequence.current++}},[load])

  const filtered=useMemo(()=>{
    if(loadedKey!==reportKey)return []
    const key=query.toLowerCase().trim()
    if(!key)return rows
    return rows.filter(r=>
      `${r.order_no} ${r.customer_name||''} ${r.customer_phone||''}`.toLowerCase().includes(key)
    )
  },[rows,query,loadedKey,reportKey])

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
      businessDateLabel(row.created_at)
    ]
  }),[filtered])

  const exportOptions=()=>({
    title:'Daftar Piutang',
    filename:`piutang-${asOf?'per-'+asOf:'saat-ini-'+today}`,
    subtitle:`Saldo piutang ${asOf?'per akhir '+dateLabel+' (WIB)':'saat ini'}. ${asOf?'Order dan pembayaran setelah tanggal batas tidak dihitung.':'Seluruh sisa tagihan berjalan.'}${query.trim()?' Pencarian: '+query.trim():''}`,
    headers:['Order','Pelanggan','Telepon','Total',asOf?'Bayar s.d. Tanggal Batas':'Sudah Bayar','Sisa Piutang',asOf?'Status pada Tanggal Batas':'Status','Dibuat'],
    rows:exportRows,
    summary:[
      ['Order Belum Lunas',filtered.length],
      ['Total Piutang',filtered.reduce((sum,row)=>sum+Math.max(0,Number(row.total)-Number(row.paid_amount)),0)]
    ] as Array<[string,string|number]>
  })

  const totalReceivable=useMemo(
    ()=>filtered.reduce((sum,r)=>sum+remainingReceivable(r),0),
    [filtered]
  )

  const avgReceivable=filtered.length?totalReceivable/filtered.length:0

  const openWA=(row:OrderRow)=>{
    void openOrderReceiptWhatsApp(row,'Halo {{pelanggan}}, kami mengingatkan sisa pembayaran order {{order}} sebesar {{sisa}}. Terima kasih.')
      .catch(error=>setMessage(error instanceof Error?error.message:'WhatsApp gagal dibuka.'))
  }

  return <>
    <PageHeader
      eyebrow="FINANCE & ACCOUNTING"
      title="Daftar Piutang"
      description={asOf?`Saldo piutang per akhir ${dateLabel} (WIB).`:"Semua order yang masih memiliki sisa tagihan saat ini."}
      action={<div className="export-actions">
        <button className="secondary-button" disabled={!ready} onClick={()=>downloadXls(exportOptions())}><FileSpreadsheet size={16}/>XLS</button>
        <button className="secondary-button" disabled={!ready} onClick={()=>printPdf(exportOptions())}><FileText size={16}/>PDF</button>
      </div>}
    />

    <section className="panel receivable-period" aria-label="Periode piutang">
      <div className="receivable-period-controls">
        <label>Bulan laporan<input aria-label="Bulan laporan piutang" type="month" max={today.slice(0,7)} value={asOf?.slice(0,7)||''} onChange={e=>{const end=monthEndReceivable(e.target.value);if(end)setAsOf(end)}}/></label>
        <label>Piutang per tanggal<input aria-label="Piutang per tanggal" type="date" max={today} value={asOf||''} onChange={e=>{if(e.target.value&&e.target.value<=today)setAsOf(e.target.value)}}/></label>
        <button className="secondary-button" onClick={()=>setAsOf(addBusinessDays(`${today.slice(0,7)}-01`,-1))}>Akhir Bulan Lalu</button>
        <button className={asOf?'secondary-button':'primary-button'} onClick={()=>setAsOf(null)}>Saat Ini</button>
        <button className="secondary-button" disabled={loading} onClick={()=>void load()}>Muat Ulang</button>
      </div>
      <p className="receivable-period-note">{asOf?`Order sampai ${dateLabel}, dikurangi pembayaran yang tercatat sampai akhir tanggal tersebut. Termasuk piutang bulan-bulan sebelumnya. Pilih Saat Ini untuk menagih saldo terbaru.`:'Pilih bulan atau tanggal untuk melihat saldo piutang pada akhir periode, termasuk order yang sudah dibayar setelah periode tersebut.'}</p>
    </section>

    <section className="stats-grid receivable-stats">
      <StatCard icon={WalletCards} label="Total Piutang" value={ready?formatIDR(totalReceivable):'—'} caption={asOf?`Per ${dateLabel}${query.trim()?' • hasil pencarian':''}`:query.trim()?'Sisa tagihan hasil pencarian':'Sisa seluruh tagihan'}/>
      <StatCard icon={ReceiptText} label="Order Belum Lunas" value={ready?String(filtered.length):'—'} caption={asOf?'Belum lunas pada tanggal batas':'Perlu ditagihkan'}/>
      <StatCard icon={CreditCard} label="Rata-rata Piutang" value={ready?formatIDR(avgReceivable):'—'} caption="Rata-rata sisa per order"/>
    </section>

    <section className="panel data-panel">
      <div className="toolbar">
        <label className="search-box">
          <Search size={18}/>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari order, pelanggan, atau WhatsApp"/>
        </label>
        <span className="record-count">{ready?filtered.length:'…'} piutang</span>
      </div>

      {message&&<div className="error-box inline-message">{message}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Pelanggan</th>
              <th>Total</th>
              <th>{asOf?'Bayar s.d. Tanggal Batas':'Sudah Bayar'}</th>
              <th>Sisa Piutang</th>
              <th>{asOf?'Status pada Tanggal Batas':'Status'}</th>
              <th>Dibuat</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {!ready&&!message&&<tr><td colSpan={8} className="table-empty">Memuat daftar piutang...</td></tr>}
            {ready&&filtered.length===0&&<tr><td colSpan={8} className="table-empty">{asOf?'Tidak ada sisa piutang pada tanggal tersebut.':'Tidak ada piutang yang cocok.'}</td></tr>}
            {filtered.map(row=>{
              const remaining=Math.max(0,Number(row.total)-Number(row.paid_amount))
              return <tr key={row.id}>
                <td><b>{row.order_no}</b></td>
                <td><b>{row.customer_name}</b><small>{row.customer_phone||'-'}</small><small className="customer-list-address">Alamat: {customerAddressById.get(row.customer_id)||(loading?'Memuat...':'Belum tersedia')}</small></td>
                <td>{formatIDR(Number(row.total))}</td>
                <td>{formatIDR(Number(row.paid_amount))}</td>
                <td><b className="receivable-amount">{formatIDR(remaining)}</b></td>
                <td><span className={`badge status-${row.status}`}>{statusLabels[row.status]}</span></td>
                <td>{businessDateLabel(row.created_at)}</td>
                <td>
                  <div className="row-actions receivable-actions">
                    {!asOf&&<button title="Bayar" className="receivable-pay" onClick={()=>navigate(`/payments?order=${encodeURIComponent(row.order_no)}`)}><CreditCard size={16}/></button>}
                    {row._exists_now!==false&&<button title={asOf?"Lihat Order Saat Ini":"Detail Order"} onClick={()=>navigate(`/orders?order=${encodeURIComponent(row.order_no)}`)}><Eye size={16}/></button>}
                    {!asOf&&<button title="WhatsApp" className="receivable-wa" onClick={()=>openWA(row)}><MessageCircle size={16}/></button>}
                    {asOf&&row._exists_now===false&&<small>Arsip historis</small>}
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
