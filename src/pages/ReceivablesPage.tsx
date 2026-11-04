import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CreditCard, Eye, FileSpreadsheet, FileText, MessageCircle, ReceiptText, Search, WalletCards } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatIDR } from '../lib/format'
import { downloadXls, printPdf } from '../lib/exportData'
import { statusLabels } from '../lib/order'
import {businessDateKey,businessDateLabel,businessMonthKey,addBusinessDays} from '../lib/businessTime'
import {loadReceivables,remainingReceivable,monthEndReceivable,receivablePaymentLabel,type ReceivableRow} from '../lib/receivables'
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
  const historical=searchParams.get('view')==='historical'
  const setView=(view:string)=>setSearchParams(previous=>{const next=new URLSearchParams(previous);if(view==='historical'){next.set('view','historical');if(!next.has('as_of'))next.set('as_of',businessDateKey())}else next.delete('view');return next},{replace:true})
  const [loadedKey,setLoadedKey]=useState<string|null>(null)
  const sequence=useRef(0)
  const today=businessDateKey()
  const reportKey=JSON.stringify([historical,asOf])
  const dateLabel=asOf?businessDateLabel(`${asOf}T12:00:00+07:00`,{day:'numeric',month:'long',year:'numeric'}):'saat ini'

  const monthLabel=asOf?businessDateLabel(`${asOf}T12:00:00+07:00`,{month:'long',year:'numeric'}):'semua bulan'
  const historicalDate=historical?asOf:null
  const reportLabel=historicalDate?`Saldo historis per ${dateLabel} (WIB)`:`Tagihan order ${monthLabel} yang masih belum lunas sekarang`

  const [customerAddresses,setCustomerAddresses]=useState<OrderCustomerAddress[]>([])
  const customerAddressById=useMemo(()=>new Map(customerAddresses.map(c=>[c.id,c.address?.trim()||'Belum diisi'])),[customerAddresses])
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const ready=!loading&&loadedKey===reportKey

  const load=useCallback(async()=>{
    const request=++sequence.current
    setLoading(true);setLoadedKey(null);setMessage('');setRows([]);setCustomerAddresses([])
    try{
      const loaded=await loadReceivables(historicalDate)
      const outstanding=!historical&&asOf?loaded.filter(r=>businessMonthKey(r.created_at)===asOf.slice(0,7)):loaded
      if(request!==sequence.current)return
      setRows(outstanding);setLoadedKey(reportKey);setLoading(false)
      try{
        const addresses=await loadOrderCustomerAddresses(outstanding.map(row=>row.customer_id))
        if(request===sequence.current)setCustomerAddresses(addresses)
      }catch(error){
        if(request===sequence.current)setMessage(error instanceof Error?error.message:'Alamat pelanggan gagal dimuat.')
      }
    }catch(error){
      if(request===sequence.current){setMessage(error instanceof Error?error.message:'Daftar piutang gagal dimuat.');setRows([]);setLoading(false)}
    }
  },[historicalDate,historical,asOf,reportKey])

  useEffect(()=>{void load();return()=>{sequence.current++}},[load])
  useEffect(()=>{
    const refresh=()=>{void load()}
    window.addEventListener('focus',refresh);window.addEventListener('happylaundry-data-invalidated',refresh)
    const timer=window.setInterval(refresh,60000)
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('happylaundry-data-invalidated',refresh)}
  },[load])

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
      receivablePaymentLabel(row),
      statusLabels[row.status],
      businessDateLabel(row.created_at)
    ]
  }),[filtered])

  const exportOptions=()=>({
    title:'Daftar Piutang',
    filename:`piutang-${historicalDate?'historis-per-'+asOf:asOf?'order-'+asOf.slice(0,7)+'-sisa-'+today:'saat-ini-'+today}`,
    subtitle:`${reportLabel}. ${historicalDate?'Pembayaran setelah tanggal batas tidak dihitung.':'Pembayaran terbaru sudah diperhitungkan; order lunas tidak ditampilkan.'}${query.trim()?' Pencarian: '+query.trim():''}`,
    headers:['Order','Pelanggan','Telepon','Total',historicalDate?'Bayar s.d. Tanggal Batas':'Sudah Bayar Saat Ini',historicalDate?'Sisa per Tanggal Batas':'Sisa Piutang Saat Ini',historicalDate?'Pembayaran pada Tanggal Batas':'Status Pembayaran',historicalDate?'Status Order pada Tanggal Batas':'Status Order','Dibuat'],
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
      description={`${reportLabel}.`}
      action={<div className="export-actions">
        <button className="secondary-button" disabled={!ready} onClick={()=>downloadXls(exportOptions())}><FileSpreadsheet size={16}/>XLS</button>
        <button className="secondary-button" disabled={!ready} onClick={()=>printPdf(exportOptions())}><FileText size={16}/>PDF</button>
      </div>}
    />

    <section className="panel receivable-period" aria-label="Periode piutang">
      <div className="receivable-period-controls">
        <label>Tampilan<select aria-label="Tampilan piutang" value={historical?'historical':'current'} onChange={e=>setView(e.target.value)}><option value="current">Belum lunas sekarang</option><option value="historical">Saldo historis per tanggal</option></select></label>
        <label>{historical?'Bulan laporan':'Bulan order'}<input aria-label="Bulan laporan piutang" type="month" max={today.slice(0,7)} value={asOf?.slice(0,7)||''} onChange={e=>{const end=monthEndReceivable(e.target.value);if(end)setAsOf(end)}}/></label>
        {historical&&<label>Piutang per tanggal<input aria-label="Piutang per tanggal" type="date" max={today} value={asOf||''} onChange={e=>{if(e.target.value&&e.target.value<=today)setAsOf(e.target.value)}}/></label>}
        <button className="secondary-button" onClick={()=>setAsOf(addBusinessDays(`${today.slice(0,7)}-01`,-1))}>Bulan Lalu</button>
        <button className={asOf?'secondary-button':'primary-button'} onClick={()=>{setSearchParams(previous=>{const next=new URLSearchParams(previous);next.delete('as_of');next.delete('view');return next},{replace:true})}}>Semua Bulan</button>
        <button className="secondary-button" disabled={loading} onClick={()=>void load()}>Muat Ulang</button>
      </div>
      <p className="receivable-period-note">{historicalDate?`Saldo pada akhir ${dateLabel}, termasuk piutang bulan-bulan sebelumnya. Pembayaran setelah tanggal tersebut tidak mengubah saldo historis. Untuk daftar penagihan terbaru, pilih Belum lunas sekarang.`:historical?'Pilih bulan atau tanggal untuk melihat saldo piutang pada akhir periode.':`Menampilkan order ${monthLabel} yang masih belum lunas sekarang. Pembayaran di bulan berikutnya ikut mengurangi sisa tagihan. Order yang sudah lunas otomatis tidak ditampilkan.`}</p>
    </section>

    <section className="stats-grid receivable-stats">
      <StatCard icon={WalletCards} label="Total Piutang" value={ready?formatIDR(totalReceivable):'—'} caption={`${historicalDate?'Per '+dateLabel:'Sisa sekarang • '+monthLabel}${query.trim()?' • hasil pencarian':''}`}/>
      <StatCard icon={ReceiptText} label="Order Belum Lunas" value={ready?String(filtered.length):'—'} caption={historicalDate?'Belum lunas pada tanggal batas':'Masih belum lunas sekarang'}/>
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
              <th>{historicalDate?'Bayar s.d. Tanggal Batas':'Sudah Bayar Saat Ini'}</th>
              <th>{historicalDate?'Sisa per Tanggal Batas':'Sisa Piutang Saat Ini'}</th>
              <th>{historicalDate?'Pembayaran pada Tanggal Batas':'Status Pembayaran'}</th>
              <th>{historicalDate?'Status Order pada Tanggal Batas':'Status Order'}</th>
              <th>Dibuat</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {!ready&&!message&&<tr><td colSpan={9} className="table-empty">Memuat daftar piutang...</td></tr>}
            {ready&&filtered.length===0&&<tr><td colSpan={9} className="table-empty">{historicalDate?'Tidak ada sisa piutang pada tanggal tersebut.':'Tidak ada tagihan yang belum lunas untuk pilihan ini.'}</td></tr>}
            {filtered.map(row=>{
              const remaining=Math.max(0,Number(row.total)-Number(row.paid_amount))
              return <tr key={row.id}>
                <td><b>{row.order_no}</b></td>
                <td><b>{row.customer_name}</b><small>{row.customer_phone||'-'}</small><small className="customer-list-address">Alamat: {customerAddressById.get(row.customer_id)||(loading?'Memuat...':'Belum tersedia')}</small></td>
                <td>{formatIDR(Number(row.total))}</td>
                <td>{formatIDR(Number(row.paid_amount))}</td>
                <td><b className="receivable-amount">{formatIDR(remaining)}</b></td>
                <td><span className={`badge receivable-payment-${Number(row.paid_amount)>0?'partial':'unpaid'}`}>{receivablePaymentLabel(row)}</span></td>
                <td><span className={`badge status-${row.status}`}>{statusLabels[row.status]}</span></td>
                <td>{businessDateLabel(row.created_at)}</td>
                <td>
                  <div className="row-actions receivable-actions">
                    {!historicalDate&&<button title="Bayar" className="receivable-pay" onClick={()=>navigate(`/payments?order=${encodeURIComponent(row.order_no)}`)}><CreditCard size={16}/></button>}
                    {row._exists_now!==false&&<button title={historicalDate?"Lihat Order Saat Ini":"Detail Order"} onClick={()=>navigate(`/orders?order=${encodeURIComponent(row.order_no)}`)}><Eye size={16}/></button>}
                    {!historicalDate&&<button title="WhatsApp" className="receivable-wa" onClick={()=>openWA(row)}><MessageCircle size={16}/></button>}
                    {historicalDate&&row._exists_now===false&&<small>Arsip historis</small>}
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
