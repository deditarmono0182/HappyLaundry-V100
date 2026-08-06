import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CreditCard, Plus, Printer, Search, ShoppingCart, Trash2, UserPlus, WalletCards } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { formatIDR } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { Customer, Service } from '../types/master'
import type { OrderItemDraft } from '../types/order'

type PayMethod = 'cash' | 'qris' | 'transfer' | 'other'

type TodayOrder = {
  id: string
  order_no: string
  customer_name: string
  total: number
  paid_amount: number
  payment_status: 'unpaid' | 'partial' | 'paid'
  created_at: string
}

const methods: Array<{ value: PayMethod; label: string }> = [
  { value: 'cash', label: 'Tunai' },
  { value: 'qris', label: 'QRIS' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'other', label: 'Lainnya' }
]

export function CashierPage() {
  const [customers,setCustomers]=useState<Customer[]>([])
  const [services,setServices]=useState<Service[]>([])
  const [todayOrders,setTodayOrders]=useState<TodayOrder[]>([])
  const [customerId,setCustomerId]=useState('')
  const [newCustomer,setNewCustomer]=useState(false)
  const [customerName,setCustomerName]=useState('')
  const [customerPhone,setCustomerPhone]=useState('')
  const [customerAddress,setCustomerAddress]=useState('')
  const [items,setItems]=useState<OrderItemDraft[]>([])
  const [discount,setDiscount]=useState(0)
  const [paymentAmount,setPaymentAmount]=useState(0)
  const [method,setMethod]=useState<PayMethod>('cash')
  const [dueAt,setDueAt]=useState('')
  const [notes,setNotes]=useState('')
  const [query,setQuery]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [success,setSuccess]=useState<{orderNo:string; total:number; paid:number}|null>(null)

  const load=useCallback(async()=>{
    const start=new Date(); start.setHours(0,0,0,0)
    const [c,s,o]=await Promise.all([
      supabase.from('v100_customers').select('*').order('name'),
      supabase.from('v100_services').select('*').eq('is_active',true).order('name'),
      supabase.from('v100_orders_view').select('id,order_no,customer_name,total,paid_amount,payment_status,created_at').gte('created_at',start.toISOString()).order('created_at',{ascending:false})
    ])
    const error=c.error||s.error||o.error
    if(error)setMessage(error.message)
    else{
      setCustomers((c.data as Customer[])||[])
      setServices((s.data as Service[])||[])
      setTodayOrders((o.data as TodayOrder[])||[])
    }
  },[])

  useEffect(()=>{void load()},[load])

  const subtotal=useMemo(()=>items.reduce((sum,item)=>sum+item.subtotal,0),[items])
  const total=Math.max(0,subtotal-Number(discount||0))
  const change=Math.max(0,Number(paymentAmount||0)-total)

  const filteredCustomers=useMemo(()=>{
    const key=query.trim().toLowerCase()
    if(!key)return customers
    return customers.filter(c=>`${c.name} ${c.phone}`.toLowerCase().includes(key))
  },[customers,query])

  const addItem=(service?:Service)=>{
    const selected=service||services[0]
    if(!selected){setMessage('Tambahkan layanan aktif terlebih dahulu.');return}
    setItems(current=>[...current,{
      key:crypto.randomUUID(),service_id:selected.id,service_name:selected.name,unit:selected.unit,
      price:Number(selected.price),quantity:1,subtotal:Number(selected.price)
    }])
  }

  const updateService=(key:string,id:string)=>{
    const service=services.find(s=>s.id===id); if(!service)return
    setItems(current=>current.map(i=>i.key===key?{...i,service_id:service.id,service_name:service.name,unit:service.unit,price:Number(service.price),subtotal:Number(service.price)*i.quantity}:i))
  }

  const updateQty=(key:string,qty:number)=>{
    const safe=Math.max(.1,qty||.1)
    setItems(current=>current.map(i=>i.key===key?{...i,quantity:safe,subtotal:i.price*safe}:i))
  }

  const reset=()=>{
    setCustomerId('');setNewCustomer(false);setCustomerName('');setCustomerPhone('');setCustomerAddress('')
    setItems([]);setDiscount(0);setPaymentAmount(0);setMethod('cash');setDueAt('');setNotes('');setQuery('')
  }

  const printReceipt=(orderNo:string,customer:string,totalValue:number,paid:number)=>{
    const w=window.open('','_blank','width=420,height=700'); if(!w)return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${orderNo}</title><style>body{font-family:Arial;width:58mm;margin:0 auto;padding:4mm;color:#111}h2,p{margin:0 0 5px;text-align:center}.line{border-top:1px dashed #111;margin:8px 0}.row{display:flex;justify-content:space-between;font-size:12px;margin:4px 0}.strong{font-weight:700}</style></head><body><h2>HappyLaundry</h2><p>Babakan, Cirebon</p><div class="line"></div><div class="row"><span>No Order</span><b>${orderNo}</b></div><div class="row"><span>Pelanggan</span><b>${customer}</b></div><div class="line"></div><div class="row strong"><span>Total</span><span>${formatIDR(totalValue)}</span></div><div class="row"><span>Dibayar</span><span>${formatIDR(paid)}</span></div><div class="row"><span>Sisa</span><span>${formatIDR(Math.max(0,totalValue-paid))}</span></div><div class="line"></div><p>Terima kasih</p><script>window.onload=()=>window.print()</script></body></html>`)
    w.document.close()
  }

  const submit=async(e:FormEvent)=>{
    e.preventDefault();setMessage('');setSuccess(null)
    if(items.length===0){setMessage('Tambahkan minimal satu layanan.');return}
    if(!newCustomer&&!customerId){setMessage('Pilih pelanggan.');return}
    if(newCustomer&&(!customerName.trim()||!customerPhone.trim())){setMessage('Nama dan WhatsApp pelanggan wajib diisi.');return}
    if(Number(paymentAmount)<0){setMessage('Nominal pembayaran tidak valid.');return}
    if(Number(paymentAmount)>total&&method!=='cash'){setMessage('Pembayaran non-tunai tidak boleh melebihi total.');return}
    setBusy(true)
    try{
      let selectedCustomer=customerId
      let selectedName=customers.find(c=>c.id===customerId)?.name||''
      if(newCustomer){
        const {data,error}=await supabase.from('v100_customers').insert({name:customerName.trim(),phone:customerPhone.trim(),address:customerAddress.trim()||null}).select().single()
        if(error)throw error
        selectedCustomer=data.id; selectedName=data.name
      }
      const paid=Math.min(Number(paymentAmount||0),total)
      const {data,error}=await supabase.rpc('v100_create_order',{
        p_customer_id:selectedCustomer,p_discount:Number(discount||0),p_paid_amount:0,p_notes:notes.trim()||null,
        p_due_at:dueAt?new Date(dueAt).toISOString():null,
        p_items:items.map(i=>({service_id:i.service_id,service_name:i.service_name,unit:i.unit,price:i.price,quantity:i.quantity}))
      })
      if(error)throw error
      const result=Array.isArray(data)?data[0]:data
      if(!result?.order_id)throw new Error('Order tidak berhasil dibuat.')
      if(paid>0){
        const pay=await supabase.rpc('v100_add_payment',{p_order_id:result.order_id,p_amount:paid,p_method:method,p_notes:'Pembayaran dari Kasir'})
        if(pay.error)throw pay.error
      }
      setSuccess({orderNo:result.order_no,total,paid})
      printReceipt(result.order_no,selectedName,total,paid)
      reset(); await load()
    }catch(err){setMessage(err instanceof Error?err.message:'Transaksi gagal.')}
    finally{setBusy(false)}
  }

  return <>
    <PageHeader eyebrow="KASIR" title="Kasir / Transaksi Baru" description="Buat order, terima pembayaran, dan cetak nota dalam satu halaman." />
    <div className="cashier-layout">
      <form className="panel cashier-form" onSubmit={submit}>
        <section className="cashier-section">
          <div className="cashier-section-title"><div><b>1. Pelanggan</b><small>Pilih pelanggan lama atau tambah pelanggan baru.</small></div><button type="button" className="secondary-button" onClick={()=>setNewCustomer(v=>!v)}><UserPlus size={16}/>{newCustomer?'Pilih Pelanggan':'Pelanggan Baru'}</button></div>
          {newCustomer?<div className="form-grid-two"><label>Nama<input value={customerName} onChange={e=>setCustomerName(e.target.value)} required/></label><label>WhatsApp<input value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} required/></label><label className="full-field">Alamat<input value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)}/></label></div>:<><label className="search-box cashier-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari nama atau WhatsApp"/></label><select className="wide-select" value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Pilih pelanggan</option>{filteredCustomers.map(c=><option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}</select></>}
        </section>

        <section className="cashier-section">
          <div className="cashier-section-title"><div><b>2. Layanan</b><small>Tambahkan berat atau jumlah cucian.</small></div><button type="button" className="secondary-button" onClick={()=>addItem()}><Plus size={16}/>Tambah Layanan</button></div>
          <div className="cashier-items">{items.length===0&&<div className="cashier-empty"><ShoppingCart size={28}/>Belum ada layanan.</div>}{items.map(item=><div className="cashier-item" key={item.key}><select value={item.service_id} onChange={e=>updateService(item.key,e.target.value)}>{services.map(s=><option key={s.id} value={s.id}>{s.name} — {formatIDR(Number(s.price))}/{s.unit}</option>)}</select><input type="number" min="0.1" step="0.1" value={item.quantity} onChange={e=>updateQty(item.key,Number(e.target.value))}/><b>{formatIDR(item.subtotal)}</b><button type="button" onClick={()=>setItems(cur=>cur.filter(i=>i.key!==item.key))}><Trash2 size={17}/></button></div>)}</div>
        </section>

        <section className="cashier-section"><div className="cashier-section-title"><div><b>3. Pembayaran</b><small>Pilih metode dan nominal yang dibayar sekarang.</small></div></div><div className="form-grid-two"><label>Diskon<input type="number" min="0" value={discount} onChange={e=>setDiscount(Number(e.target.value))}/></label><label>Bayar Sekarang<input type="number" min="0" value={paymentAmount} onChange={e=>setPaymentAmount(Number(e.target.value))}/></label><label>Metode<select value={method} onChange={e=>setMethod(e.target.value as PayMethod)}>{methods.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select></label><label>Estimasi Selesai<input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label><label className="full-field">Catatan<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Contoh: tanpa pewangi kuat"/></label></div></section>

        {message&&<div className="error-box">{message}</div>}
        {success&&<div className="success-box"><CheckCircle2 size={18}/>Order {success.orderNo} berhasil dibuat.</div>}
        <div className="cashier-actions"><button type="button" className="secondary-button" onClick={reset}>Bersihkan</button><button className="primary-button" disabled={busy}><Printer size={17}/>{busy?'Menyimpan...':'Simpan & Cetak Nota'}</button></div>
      </form>

      <aside className="cashier-summary">
        <section className="panel cashier-total-card"><span>Total Belanja</span><strong>{formatIDR(total)}</strong><div><span>Subtotal</span><b>{formatIDR(subtotal)}</b></div><div><span>Diskon</span><b>{formatIDR(discount)}</b></div><div><span>Dibayar</span><b>{formatIDR(Math.min(paymentAmount,total))}</b></div>{method==='cash'&&paymentAmount>total&&<div className="cashier-change"><span>Kembalian</span><b>{formatIDR(change)}</b></div>}<div><span>Sisa Tagihan</span><b>{formatIDR(Math.max(0,total-paymentAmount))}</b></div></section>
        <section className="panel cashier-today"><header><b>Transaksi Hari Ini</b><span>{todayOrders.length}</span></header>{todayOrders.slice(0,8).map(o=><div key={o.id}><span><b>{o.order_no}</b><small>{o.customer_name}</small></span><b>{formatIDR(Number(o.total))}</b></div>)}{todayOrders.length===0&&<p>Belum ada transaksi hari ini.</p>}</section>
      </aside>
    </div>
  </>
}
