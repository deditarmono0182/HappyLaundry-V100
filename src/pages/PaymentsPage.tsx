import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleDollarSign, CreditCard, Eye, Image, PackageCheck, Search, WalletCards, XCircle } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { formatIDR } from '../lib/format'
import { paymentLabels } from '../lib/order'
import { supabase } from '../lib/supabase'
import type { OrderRow } from '../types/order'

type Method='cash'|'qris'|'transfer'|'other'
const methodLabels:Record<Method,string>={cash:'Tunai',qris:'QRIS',transfer:'Transfer',other:'Lainnya'}

type OnlineProof={
  id:string
  order_id:string
  order_no:string
  method:'qris'|'transfer'
  bank_account_id:string|null
  amount:number
  photo_path:string
  status:'pending'|'confirmed'|'rejected'
  submitted_at:string
}


export function PaymentsPage(){
  const [searchParams]=useSearchParams()
  const [rows,setRows]=useState<OrderRow[]>([])
  const [query,setQuery]=useState('')
  const [selected,setSelected]=useState<OrderRow|null>(null)
  const [amount,setAmount]=useState(0)
  const [method,setMethod]=useState<Method>('cash')
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)
  const [paymentAction,setPaymentAction]=useState<'pay'|'pickup'>('pay')
  const [success,setSuccess]=useState('')
  const [proofs,setProofs]=useState<OnlineProof[]>([])
  const [proofBusyId,setProofBusyId]=useState<string|null>(null)

  const load=useCallback(async()=>{
    const [ordersResult,proofResult]=await Promise.all([
      supabase.from('v100_orders_view').select('*').order('created_at',{ascending:false}),
      supabase.from('v1129_payment_proofs').select('id,order_id,order_no,method,bank_account_id,amount,photo_path,status,submitted_at').eq('status','pending').order('submitted_at',{ascending:true})
    ])
    const error=ordersResult.error||proofResult.error
    if(error)setMessage(error.message)
    else{
      setRows((((ordersResult.data as OrderRow[])||[]).filter(r=>Number(r.paid_amount)<Number(r.total))))
      setProofs((proofResult.data as OnlineProof[])||[])
    }
  },[])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{
    const orderParam=searchParams.get('order')?.trim()
    if(!orderParam||rows.length===0)return
    setQuery(orderParam)
    const found=rows.find(row=>row.order_no.toLowerCase()===orderParam.toLowerCase())
    if(found)openPay(found)
  },[searchParams,rows])

  const filtered=useMemo(()=>{const k=query.toLowerCase().trim();return !k?rows:rows.filter(r=>`${r.order_no} ${r.customer_name} ${r.customer_phone}`.toLowerCase().includes(k))},[rows,query])
  const receivable=rows.reduce((s,r)=>s+Math.max(0,Number(r.total)-Number(r.paid_amount)),0)

  const openPay=(row:OrderRow)=>{
    setSelected(row)
    setAmount(Number(row.total)-Number(row.paid_amount))
    setMethod('cash')
    setPaymentAction('pay')
    setMessage('')
    setSuccess('')
  }
  const submit=async(e:FormEvent)=>{
    e.preventDefault()
    if(!selected)return

    const remaining=Number(selected.total)-Number(selected.paid_amount)

    // Bayar & Ambil harus melunasi seluruh sisa tagihan.
    const payAmount=paymentAction==='pickup'?remaining:Number(amount)

    if(payAmount<=0||payAmount>remaining){
      setMessage('Nominal pembayaran tidak valid.')
      return
    }

    setBusy(true)
    setMessage('')
    setSuccess('')

    const payment=await supabase.rpc('v100_add_payment',{
      p_order_id:selected.id,
      p_amount:Number(payAmount),
      p_method:method,
      p_notes:paymentAction==='pickup'?'Pembayaran + barang diambil pelanggan':null
    })

    if(payment.error){
      setMessage(payment.error.message)
      setBusy(false)
      return
    }

    if(paymentAction==='pickup'){
      const orderUpdate=await supabase
        .from('v100_orders')
        .update({
          status:'completed',
          updated_at:new Date().toISOString()
        })
        .eq('id',selected.id)

      if(orderUpdate.error){
        setMessage(`Pembayaran berhasil, tetapi status order gagal menjadi Selesai: ${orderUpdate.error.message}`)
        setBusy(false)
        await load()
        return
      }

      setSuccess(`${selected.order_no} sudah LUNAS dan barang tercatat DIAMBIL / SELESAI.`)
    }else{
      setSuccess(`Pembayaran ${selected.order_no} berhasil dicatat.`)
    }

    setSelected(null)
    await load()
    setBusy(false)
  }

  const viewProof=async(proof:OnlineProof)=>{
    const {data,error}=await supabase.storage.from('payment-proofs').createSignedUrl(proof.photo_path,300)
    if(error){setMessage(error.message);return}
    window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }

  const confirmProof=async(proof:OnlineProof,completeOrder=false)=>{
    const order=rows.find(row=>row.id===proof.order_id)
    const confirmation=completeOrder
      ? `${proof.order_no}\nKonfirmasi pembayaran ${formatIDR(Number(proof.amount))} sebagai LUNAS dan barang SUDAH DIAMBIL? Order akan menjadi Selesai.`
      : `${proof.order_no}\nKonfirmasi pembayaran ${formatIDR(Number(proof.amount))} sebagai LUNAS? Status proses laundry TIDAK akan berubah.`

    if(!window.confirm(confirmation))return

    setProofBusyId(proof.id);setMessage('');setSuccess('')
    const {error}=await supabase.rpc('v11326_confirm_payment_proof',{
      p_proof_id:proof.id,
      p_complete_order:completeOrder
    })
    if(error)setMessage(error.message)
    else{
      setSuccess(
        completeOrder
          ? `${proof.order_no} LUNAS dan barang tercatat SUDAH DIAMBIL / SELESAI.`
          : `${proof.order_no} berhasil LUNAS. Status proses laundry tetap tidak berubah.`
      )
      await load()
    }
    setProofBusyId(null)
  }

  const rejectProof=async(proof:OnlineProof)=>{
    const reason=window.prompt('Alasan menolak bukti pembayaran:','Bukti pembayaran belum sesuai.')
    if(reason===null)return
    setProofBusyId(proof.id);setMessage('');setSuccess('')
    const {error}=await supabase.rpc('v1129_reject_payment_proof',{p_proof_id:proof.id,p_reason:reason})
    if(error)setMessage(error.message)
    else{setSuccess(`Bukti ${proof.order_no} ditolak. Pelanggan dapat upload ulang.`);await load()}
    setProofBusyId(null)
  }

  return <>
    <PageHeader eyebrow="KASIR" title="Pembayaran" description="Terima pembayaran atau selesaikan pembayaran sekaligus saat barang diambil pelanggan."/>
    <section className="stats-grid compact-stats">
      <article className="stat-card"><div className="stat-icon"><WalletCards size={22}/></div><div><span>Order Belum Lunas</span><strong>{rows.length}</strong><small>Perlu ditagihkan</small></div></article>
      <article className="stat-card"><div className="stat-icon"><CircleDollarSign size={22}/></div><div><span>Total Piutang</span><strong>{formatIDR(receivable)}</strong><small>Sisa seluruh order</small></div></article>
      <article className="stat-card"><div className="stat-icon"><CreditCard size={22}/></div><div><span>Metode Pembayaran</span><strong>4</strong><small>Tunai, QRIS, transfer, lainnya</small></div></article>
    </section>
    {success&&<div className="success-box payment-success-banner"><CheckCircle2 size={18}/>{success}</div>}
    <section className="panel online-proof-panel">
      <div className="online-proof-title">
        <div><b>Konfirmasi Pembayaran Online</b><small>Bukti dari Tracking Pelanggan yang menunggu pengecekan.</small></div>
        <span>{proofs.length} menunggu</span>
      </div>
      {proofs.length===0
        ? <div className="mini-empty">Belum ada bukti pembayaran online yang menunggu konfirmasi.</div>
        : <div className="online-proof-list">{proofs.map(proof=><article className="online-proof-card" key={proof.id}>
            <div className="online-proof-main">
              <Image size={20}/>
              <span><b>{proof.order_no}</b><small>{proof.method==='qris'?'QRIS':'Transfer Bank'} • {new Date(proof.submitted_at).toLocaleString('id-ID')}</small></span>
              <strong>{formatIDR(Number(proof.amount))}</strong>
            </div>
            <div className="online-proof-actions">
              <button type="button" className="secondary-button" onClick={()=>void viewProof(proof)}><Eye size={15}/>Lihat Bukti</button>
              <button
                type="button"
                className="primary-button proof-confirm-button"
                disabled={proofBusyId===proof.id}
                onClick={()=>void confirmProof(proof,false)}
              >
                <CheckCircle2 size={15}/>
                Konfirmasi Lunas
              </button>
              <button
                type="button"
                className="primary-button proof-pickup-button"
                disabled={proofBusyId===proof.id}
                onClick={()=>void confirmProof(proof,true)}
                title="Konfirmasi pembayaran lunas dan barang sudah diterima/diambil pelanggan" 
              >
                <PackageCheck size={15}/>
                Lunas & Ambil Barang
              </button>
              <button type="button" className="secondary-button proof-reject" disabled={proofBusyId===proof.id} onClick={()=>void rejectProof(proof)}><XCircle size={15}/>Tolak</button>
            </div>
          </article>)}</div>}
    </section>

    <section className="panel data-panel"><div className="toolbar"><label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari order atau pelanggan"/></label><span className="record-count">{filtered.length} tagihan</span></div>
      {message&&<div className="error-box inline-message">{message}</div>}
      <div className="table-wrap"><table><thead><tr><th>Order</th><th>Pelanggan</th><th>Total</th><th>Sudah Bayar</th><th>Sisa</th><th>Status</th><th/></tr></thead><tbody>
      {filtered.length===0&&<tr><td colSpan={7} className="table-empty">Tidak ada tagihan belum lunas.</td></tr>}
      {filtered.map(r=><tr key={r.id}><td><b>{r.order_no}</b></td><td><b>{r.customer_name}</b><small>{r.customer_phone}</small></td><td>{formatIDR(Number(r.total))}</td><td>{formatIDR(Number(r.paid_amount))}</td><td><b>{formatIDR(Number(r.total)-Number(r.paid_amount))}</b></td><td><span className={`badge payment-${r.payment_status}`}>{paymentLabels[r.payment_status]}</span></td><td>
        <div className="payment-row-actions">
          <button className="small-primary" onClick={()=>{
            openPay(r)
            setPaymentAction('pay')
          }}>Bayar</button>
          <button className="small-primary pay-pickup-row" onClick={()=>{
            openPay(r)
            setPaymentAction('pickup')
          }}><PackageCheck size={14}/>Bayar & Ambil</button>
        </div>
      </td></tr>)}
      </tbody></table></div>
    </section>
    {selected&&<Modal title={`Pembayaran ${selected.order_no}`} onClose={()=>setSelected(null)}>
      <form className="modal-form" onSubmit={submit}>
        <div className="payment-summary">
          <div><span>Pelanggan</span><b>{selected.customer_name}</b></div>
          <div><span>Status Produksi</span><b>{selected.status==='ready'?'Siap Diambil':selected.status==='completed'?'Selesai':'Masih Diproses'}</b></div>
          <div><span>Sisa Tagihan</span><b>{formatIDR(Number(selected.total)-Number(selected.paid_amount))}</b></div>
        </div>

        <div className="payment-action-cards">
          <button
            type="button"
            className={`payment-action-card ${paymentAction==='pay'?'active':''}`}
            onClick={()=>{
              setPaymentAction('pay')
              setAmount(Number(selected.total)-Number(selected.paid_amount))
            }}
          >
            <CreditCard size={24}/>
            <span><b>Bayar Saja</b><small>Catat pembayaran. Status produksi tidak berubah.</small></span>
          </button>

          <button
            type="button"
            className={`payment-action-card pickup ${paymentAction==='pickup'?'active':''}`}
            onClick={()=>{
              setPaymentAction('pickup')
              setAmount(Number(selected.total)-Number(selected.paid_amount))
            }}
          >
            <PackageCheck size={24}/>
            <span><b>Bayar & Ambil</b><small>Lunasi tagihan dan langsung ubah order menjadi Selesai.</small></span>
          </button>
        </div>

        <label>
          Nominal Pembayaran
          <input
            type="number"
            min="1"
            max={Number(selected.total)-Number(selected.paid_amount)}
            value={paymentAction==='pickup'
              ? Number(selected.total)-Number(selected.paid_amount)
              : amount}
            onChange={e=>setAmount(Number(e.target.value))}
            disabled={paymentAction==='pickup'}
          />
          {paymentAction==='pickup'&&<small className="payment-full-note">Bayar & Ambil otomatis memakai seluruh sisa tagihan.</small>}
        </label>

        <label>
          Metode
          <select value={method} onChange={e=>setMethod(e.target.value as Method)}>
            {Object.entries(methodLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        </label>

        {paymentAction==='pickup'&&
          <div className="payment-pickup-warning">
            <PackageCheck size={18}/>
            <span>
              <b>Barang akan dianggap sudah diambil.</b>
              <small>Setelah disimpan, order otomatis keluar dari proses produksi aktif dan status menjadi Selesai.</small>
            </span>
          </div>}

        {message&&<div className="error-box">{message}</div>}

        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={()=>setSelected(null)}>Batal</button>
          <button className={`primary-button ${paymentAction==='pickup'?'payment-pickup-submit':''}`} disabled={busy}>
            {busy
              ? 'Memproses...'
              : paymentAction==='pickup'
                ? 'Bayar & Ambil Sekarang'
                : 'Simpan Pembayaran'}
          </button>
        </div>
      </form>
    </Modal>}
  </>
}
