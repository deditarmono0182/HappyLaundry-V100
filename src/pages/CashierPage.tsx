import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, FileText, MessageCircle, Plus, Printer, QrCode, Search,
  ShoppingCart, Trash2, UserPlus, WalletCards
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { formatIDR } from '../lib/format'
import { supabase } from '../lib/supabase'
import { fillTemplate, openWhatsApp } from '../lib/whatsapp'
import { defaultReceiptPrintSettings, type ReceiptPrintSettings } from '../lib/receiptSettings'
import type { StoreSettings } from '../types/settings'
import type { Customer, Service } from '../types/master'
import type { OrderItemDraft } from '../types/order'

type PayMethod = 'cash' | 'qris' | 'transfer' | 'other'
type DiscountMode = 'nominal' | 'percent'
type ReceiptSize = '58' | '80' | 'a4'

type CommissionEmployee = {
  id: string
  full_name: string
  login_id: string
}

type CommissionSetting = {
  employee_id: string
  production_percent: number
  courier_percent: number
}

type TodayOrder = {
  id: string
  order_no: string
  customer_name: string
  total: number
  paid_amount: number
  payment_status: 'unpaid' | 'partial' | 'paid'
  created_at: string
}

type SuccessData = {
  orderId: string
  orderNo: string
  total: number
  subtotal: number
  discount: number
  paid: number
  customer: string
  phone: string
  due: string
  method: PayMethod
  notes: string
  items: OrderItemDraft[]
  workerName: string
  courierName: string
}

const methods: Array<{ value: PayMethod; label: string }> = [
  { value: 'cash', label: 'Tunai' },
  { value: 'qris', label: 'QRIS' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'other', label: 'Lainnya' }
]

const methodLabels: Record<PayMethod,string> = {
  cash:'Tunai', qris:'QRIS', transfer:'Transfer', other:'Lainnya'
}

export function CashierPage() {
  const navigate=useNavigate()
  const [customers,setCustomers]=useState<Customer[]>([])
  const [services,setServices]=useState<Service[]>([])
  const [todayOrders,setTodayOrders]=useState<TodayOrder[]>([])
  const [commissionEmployees,setCommissionEmployees]=useState<CommissionEmployee[]>([])
  const [commissionSettings,setCommissionSettings]=useState<CommissionSetting[]>([])
  const [workerId,setWorkerId]=useState('')
  const [courierId,setCourierId]=useState('')
  const [customerId,setCustomerId]=useState('')
  const [newCustomer,setNewCustomer]=useState(false)
  const [customerName,setCustomerName]=useState('')
  const [customerPhone,setCustomerPhone]=useState('')
  const [customerAddress,setCustomerAddress]=useState('')
  const [items,setItems]=useState<OrderItemDraft[]>([])
  const [quantityDraft,setQuantityDraft]=useState<Record<string,string>>({})
  const [discountValue,setDiscountValue]=useState(0)
  const [discountMode,setDiscountMode]=useState<DiscountMode>('nominal')
  const [paymentAmount,setPaymentAmount]=useState(0)
  const [method,setMethod]=useState<PayMethod>('cash')
  const [dueAt,setDueAt]=useState('')
  const [notes,setNotes]=useState('')
  const [query,setQuery]=useState('')
  const [serviceCategory,setServiceCategory]=useState('Semua')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [success,setSuccess]=useState<SuccessData|null>(null)
  const [storeSettings,setStoreSettings]=useState<StoreSettings|null>(null)
  const [printSettings,setPrintSettings]=useState<ReceiptPrintSettings>(defaultReceiptPrintSettings)
  const formRef=useRef<HTMLFormElement|null>(null)
  const customerSearchRef=useRef<HTMLInputElement|null>(null)

  const load=useCallback(async()=>{
    const start=new Date(); start.setHours(0,0,0,0)
    const [c,s,o,settings,print,employees,commission]=await Promise.all([
      supabase.from('v100_customers').select('*').order('name'),
      supabase.from('v100_services').select('*').eq('is_active',true).order('name'),
      supabase.from('v100_orders_view')
        .select('id,order_no,customer_name,total,paid_amount,payment_status,created_at')
        .gte('created_at',start.toISOString()).order('created_at',{ascending:false}),
      supabase.from('v100_store_settings').select('*').eq('id',1).maybeSingle(),
      supabase.from('v110_receipt_print_settings').select('*').eq('id',1).maybeSingle(),
      supabase.rpc('v113_list_commission_employees'),
      supabase.from('v113_employee_commission_settings').select('employee_id,production_percent,courier_percent')
    ])
    const error=c.error||s.error||o.error||settings.error||employees.error||commission.error
    if(error)setMessage(error.message)
    else{
      setCustomers((c.data as Customer[])||[])
      setServices((s.data as Service[])||[])
      setTodayOrders((o.data as TodayOrder[])||[])
      setCommissionEmployees((employees.data as CommissionEmployee[])||[])
      setCommissionSettings((commission.data as CommissionSetting[])||[])
      setStoreSettings((settings.data as StoreSettings|null)||null)
      if(print.data)setPrintSettings({...defaultReceiptPrintSettings,...print.data} as ReceiptPrintSettings)
    }
  },[])

  useEffect(()=>{void load()},[load])

  // Keyboard shortcuts for faster cashier operation.
  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='F2'){
        event.preventDefault()
        customerSearchRef.current?.focus()
      }
      if(event.key==='F4'){
        event.preventDefault()
        addItem()
      }
      if(event.ctrlKey&&event.key==='Enter'){
        event.preventDefault()
        if(!busy)formRef.current?.requestSubmit()
      }
      if(event.key==='Escape'&&items.length>0&&!busy){
        event.preventDefault()
        if(window.confirm('Bersihkan transaksi yang sedang diisi?'))reset()
      }
    }
    window.addEventListener('keydown',onKeyDown)
    return()=>window.removeEventListener('keydown',onKeyDown)
  },[busy,items.length,services])

  const subtotal=useMemo(()=>items.reduce((sum,item)=>sum+item.subtotal,0),[items])
  const discount=discountMode==='percent'
    ? Math.min(subtotal, subtotal*Math.min(100,Math.max(0,Number(discountValue||0)))/100)
    : Math.min(subtotal,Math.max(0,Number(discountValue||0)))
  const total=Math.max(0,subtotal-discount)
  const change=Math.max(0,Number(paymentAmount||0)-total)
  const hasCustomer=newCustomer
    ? Boolean(customerName.trim()&&customerPhone.trim())
    : Boolean(customerId)
  const canSubmit=hasCustomer&&items.length>0&&total>=0&&!busy

  const serviceCategories=useMemo(()=>['Semua',...Array.from(new Set(services.map(s=>(s as any).category||'Reguler')))], [services])
  const filteredServices=useMemo(()=>serviceCategory==='Semua'?services:services.filter(s=>((s as any).category||'Reguler')===serviceCategory),[services,serviceCategory])

  const filteredCustomers=useMemo(()=>{
    const key=query.trim().toLowerCase()
    if(!key)return customers
    return customers.filter(c=>`${c.name} ${c.phone}`.toLowerCase().includes(key))
  },[customers,query])

  const commissionSettingMap=useMemo(()=>new Map(commissionSettings.map(row=>[row.employee_id,row])),[commissionSettings])
  const workerPercent=Number(commissionSettingMap.get(workerId)?.production_percent||0)
  const courierPercent=Number(commissionSettingMap.get(courierId)?.courier_percent||0)
  const workerCommission=total*(workerPercent/100)
  const courierCommission=total*(courierPercent/100)

  const addItem=(service?:Service)=>{
    const selected=service||filteredServices[0]||services[0]
    if(!selected){setMessage('Tambahkan layanan aktif terlebih dahulu.');return}
    const key=crypto.randomUUID()
    setItems(current=>[...current,{
      key,service_id:selected.id,service_name:selected.name,unit:selected.unit,
      price:Number(selected.price),quantity:1,subtotal:Number(selected.price)
    }])
    setQuantityDraft(current=>({...current,[key]:'1'}))
  }

  const updateService=(key:string,id:string)=>{
    const service=services.find(s=>s.id===id); if(!service)return
    setItems(current=>current.map(i=>i.key===key?{
      ...i,service_id:service.id,service_name:service.name,unit:service.unit,
      price:Number(service.price),subtotal:Number(service.price)*i.quantity
    }:i))
  }

  const parseFlexibleNumber=(value:string)=>{
    const normalized=value.replace(',','.').trim()
    if(!normalized||normalized==='.'||normalized==='-')return null
    const parsed=Number(normalized)
    return Number.isFinite(parsed)?parsed:null
  }

  const updateQtyDraft=(key:string,value:string)=>{
    const cleaned=value.replace(/[^0-9.,]/g,'')
    setQuantityDraft(current=>({...current,[key]:cleaned}))
    const parsed=parseFlexibleNumber(cleaned)
    if(parsed===null||parsed<=0)return
    setItems(current=>current.map(i=>
      i.key===key?{...i,quantity:parsed,subtotal:i.price*parsed}:i
    ))
  }

  const finishQtyEdit=(key:string)=>{
    const parsed=parseFlexibleNumber(quantityDraft[key]??'')
    const safe=parsed!==null&&parsed>0?parsed:.1
    setQuantityDraft(current=>({...current,[key]:String(safe)}))
    setItems(current=>current.map(i=>
      i.key===key?{...i,quantity:safe,subtotal:i.price*safe}:i
    ))
  }

  const reset=()=>{
    setCustomerId('');setNewCustomer(false);setCustomerName('');setCustomerPhone('');setCustomerAddress('')
    setItems([]);setQuantityDraft({});setDiscountValue(0);setDiscountMode('nominal');setPaymentAmount(0)
    setMethod('cash');setDueAt('');setNotes('');setQuery('');setWorkerId('');setCourierId('');setMessage('')
  }

  const confirmReset=()=>{
    if(items.length===0){reset();return}
    if(window.confirm('Bersihkan transaksi yang sedang diisi?'))reset()
  }

  const quickPay=(mode:'exact'|'50k'|'100k')=>{
    if(mode==='exact')setPaymentAmount(total)
    if(mode==='50k')setPaymentAmount(50000)
    if(mode==='100k')setPaymentAmount(100000)
  }

  const receiptHtml=(data:SuccessData,size:ReceiptSize)=>{
    const settings=storeSettings
    const business=settings?.business_name||'HappyLaundry Babakan'
    const address=settings?.address||'Babakan, Cirebon'
    const phone=settings?.phone||''
    const maps=settings?.maps_url||''
    const footer=printSettings.footer_note||settings?.receipt_footer||'Terima kasih telah menggunakan HappyLaundry.'
    const width=size==='58'?'58mm':size==='80'?'80mm':'190mm'
    const page=size==='a4'?'A4 portrait':`${size}mm auto`
    const title=size==='a4'?'INVOICE LAUNDRY':'NOTA LAUNDRY'
    const statusUrl=`${window.location.origin}/track/${encodeURIComponent(data.orderNo)}`
    const qrUrl=`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(statusUrl)}`
    const logoAlign=printSettings.logo_align==='left'?'left':printSettings.logo_align==='right'?'right':'center'
    const logoMarginLeft=logoAlign==='left'?'0':'auto'
    const logoMarginRight=logoAlign==='right'?'0':'auto'
    const rows=data.items.map(item=>`
      <tr>
        <td>${item.service_name}${printSettings.show_item_price?`<small>${item.quantity} ${item.unit} × ${formatIDR(item.price)}</small>`:`<small>${item.quantity} ${item.unit}</small>`}</td>
        <td>${formatIDR(item.subtotal)}</td>
      </tr>`).join('')
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${data.orderNo}</title>
    <style>
      @page{size:${page};margin:${size==='a4'?'12mm':'3mm'}}
      *{box-sizing:border-box;-webkit-text-size-adjust:100%}html,body{min-height:100%}
      body{font-family:Arial,sans-serif;width:${width};max-width:100%;margin:0 auto;padding:${size==='a4'?'10mm':'3mm'};color:#111;font-size:${Math.max(8,Math.min(18,printSettings.font_size||11))}px;background:#fff}
      h1,h2,p{margin:0}.center{text-align:center}.logo-wrap{display:block!important;width:100%!important;text-align:${logoAlign}!important}
      .logo{display:block!important;width:${Math.min(180,Math.max(30,Number(printSettings.logo_width)||64))}px;max-width:90%!important;height:auto!important;max-height:${size==='a4'?'120px':'90px'};object-fit:contain!important;margin-left:${logoMarginLeft}!important;margin-right:${logoMarginRight}!important}
      .title{font-size:${size==='a4'?'26px':'17px'};margin-top:6px}.muted{color:#555}.small{font-size:10px}.line{border-top:1px dashed #333;margin:9px 0}
      .meta,.summary{width:100%;border-collapse:collapse}.meta td,.summary td{padding:3px 0;vertical-align:top}.meta td:last-child,.summary td:last-child{text-align:right;font-weight:700}
      .items{width:100%;border-collapse:collapse}.items th{border-bottom:1px solid #222;padding:5px 0;text-align:left}.items th:last-child,.items td:last-child{text-align:right}
      .items td{padding:6px 0;border-bottom:1px dotted #aaa}.items small{display:block;color:#555;margin-top:2px}
      .grand{font-size:${size==='a4'?'20px':'14px'};font-weight:800}.qr{width:${size==='a4'?'105px':'82px'};height:${size==='a4'?'105px':'82px'};margin:6px auto;display:block}
      .order-code{text-align:center;font-size:10px;letter-spacing:1px}
      .a4-grid{${size==='a4'?'display:grid;grid-template-columns:1fr 130px;gap:22px;align-items:start':''}}
      .footer{margin-top:9px;text-align:center}
      .no-print{margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
      .no-print button{padding:10px 14px;border:0;border-radius:8px;font-weight:800;cursor:pointer}
      .print-button{background:#087d55;color:#fff}
      .close-preview-button{background:#eef6fb!important;color:#145f91!important;border:1px solid #b9d7e8!important}
      .preview-top-close{
        position:fixed;top:max(12px,env(safe-area-inset-top));right:12px;z-index:9999;
        width:44px;height:44px;border:1px solid #c8dce8;border-radius:50%;
        display:grid;place-items:center;background:#fff;color:#185f8d;
        font:900 23px/1 Arial;box-shadow:0 8px 24px rgba(20,75,112,.16);cursor:pointer
      }
      @media screen and (max-width:700px){
        html,body{
          width:100%!important;
          max-width:100%!important;
          margin:0!important;
        }
        body{
          width:min(96vw,560px)!important;
          max-width:96vw!important;
          padding:18px 14px 24px!important;
          padding-top:calc(18px + env(safe-area-inset-top))!important;
          font-size:15px!important;
          line-height:1.42!important;
        }
        .title{font-size:24px!important;margin-top:8px!important}
        .meta td,.summary td{padding:5px 0!important;font-size:14px!important}
        .items th{font-size:14px!important;padding:7px 0!important}
        .items td{font-size:14px!important;padding:8px 0!important}
        .items small{font-size:11px!important}
        .grand{font-size:18px!important}
        .small{font-size:12px!important;line-height:1.4!important}
        .qr{width:132px!important;height:132px!important;margin:10px auto!important}
        .barcode{height:56px!important;margin-top:10px!important}
        
        .order-code{font-size:11px!important}
        .footer{font-size:12px!important;margin-top:12px!important}
        .line{margin:11px 0!important}
        .no-print{display:grid!important;gap:9px!important;margin-top:18px!important}
        .no-print button{width:100%!important;min-height:50px!important;font-size:14px!important}
        .preview-top-close{width:48px!important;height:48px!important;right:14px!important;top:max(12px,env(safe-area-inset-top))!important}
        .logo{max-height:105px!important}
      }
      @media print{.no-print,.preview-top-close{display:none!important}}
    </style>
    <script>
      function closeReceiptPreview(){
        try{ window.close(); }catch(e){}
        setTimeout(function(){
          if(!window.closed){
            window.location.href=window.location.origin+'/cashier'
          }
        },180)
      }
    </script>
    </head><body>
      <button class="preview-top-close" type="button" onclick="closeReceiptPreview()" aria-label="Tutup preview nota" title="Tutup preview nota">×</button>
      <div class="center">
        ${printSettings.show_logo?`<div class="logo-wrap" data-logo-align="${logoAlign}"><img class="logo" src="${printSettings.logo_url||'/logo-happylaundry.jpg'}" style="display:block;width:${Math.min(180,Math.max(30,Number(printSettings.logo_width)||64))}px;max-width:90%;height:auto;margin-left:${logoMarginLeft};margin-right:${logoMarginRight};object-fit:contain"></div>`:''}
        <h1 class="title">${business}</h1>
        <p>${address}</p><p>${phone}</p>
        <p class="muted">${title}</p>
        ${printSettings.header_note?`<p><b>${printSettings.header_note}</b></p>`:''}
      </div>
      <div class="line"></div>
      <div class="a4-grid"><div>
        <table class="meta">
          <tr><td>No. Order</td><td>${data.orderNo}</td></tr>
          <tr><td>Tanggal</td><td>${new Date().toLocaleString('id-ID')}</td></tr>
          <tr><td>Pelanggan</td><td>${data.customer}</td></tr>
          ${printSettings.show_customer_phone?`<tr><td>WhatsApp</td><td>${data.phone}</td></tr>`:''}
          ${printSettings.show_due_at?`<tr><td>Estimasi</td><td>${data.due||'-'}</td></tr>`:''}
          ${printSettings.show_payment_method?`<tr><td>Metode</td><td>${methodLabels[data.method]}</td></tr>`:''}
          <tr><td>Dikerjakan oleh</td><td>${data.workerName||'-'}</td></tr>
          <tr><td>Kurir</td><td>${data.courierName||'-'}</td></tr>
        </table>
        <div class="line"></div>
        <table class="items"><thead><tr><th>Layanan</th><th>Jumlah</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="line"></div>
        <table class="summary">
          <tr><td>Subtotal</td><td>${formatIDR(data.subtotal)}</td></tr>
          ${printSettings.show_discount?`<tr><td>Diskon</td><td>${formatIDR(data.discount)}</td></tr>`:''}
          <tr class="grand"><td>Total</td><td>${formatIDR(data.total)}</td></tr>
          ${printSettings.show_paid?`<tr><td>Dibayar</td><td>${formatIDR(data.paid)}</td></tr>`:''}
          ${printSettings.show_balance?`<tr><td>Sisa</td><td>${formatIDR(Math.max(0,data.total-data.paid))}</td></tr>`:''}
          ${data.method==='cash'&&data.paid>data.total?`<tr><td>Kembalian</td><td>${formatIDR(data.paid-data.total)}</td></tr>`:''}
        </table>
        ${data.notes?`<div class="line"></div><p><b>Catatan:</b> ${data.notes}</p>`:''}
      </div>
      <div>
        ${printSettings.show_qr?`<img class="qr" src="${qrUrl}" alt="QR status order"><p class="center small"><b>Scan untuk melihat status laundry</b></p><p class="center small">${statusUrl}</p>`:''}
        ${printSettings.show_barcode?`
<p class="order-code">${data.orderNo}</p>`:''}
        ${printSettings.show_maps&&maps?`<p class="center small">${maps}</p>`:''}
      </div></div>
      ${printSettings.show_cut_line?'<div class="line"></div>':''}
      <p class="footer">${footer}</p>
      <div class="no-print">
        <button class="print-button" type="button" onclick="window.print()">Cetak / Simpan PDF</button>
        <button class="close-preview-button" type="button" onclick="closeReceiptPreview()">← Tutup Preview Nota</button>
      </div>
    </body></html>`
  }

  const printReceipt=(data:SuccessData,size:ReceiptSize)=>{
    const dimensions=size==='a4'?'width=900,height=900':'width=520,height=850'
    const w=window.open('','_blank',dimensions); if(!w)return
    w.document.write(receiptHtml(data,size));w.document.close()
  }

  const sendOrderWhatsApp=()=>{
    if(!success)return
    try{
      const template=storeSettings?.whatsapp_order_template||
        'Halo {{pelanggan}}, cucian Anda sudah kami terima. Nomor order: {{order}}. Total: {{total}}.'
      const trackingUrl=`${window.location.origin}/track/${encodeURIComponent(success.orderNo)}`
      const baseText=fillTemplate(template,{
        pelanggan:success.customer,order:success.orderNo,total:formatIDR(success.total),
        estimasi:success.due||'-',usaha:storeSettings?.business_name||'HappyLaundry Babakan'
      })
      const text=`${baseText}\n\nCek status laundry Anda:\n${trackingUrl}`
      openWhatsApp(success.phone,text)
    }catch(err){setMessage(err instanceof Error?err.message:'WhatsApp gagal dibuka.')}
  }

  const submit=async(e:FormEvent)=>{
    e.preventDefault();setMessage('');setSuccess(null)
    if(items.length===0){setMessage('Tambahkan minimal satu layanan.');return}
    if(!newCustomer&&!customerId){setMessage('Pilih pelanggan.');return}
    if(newCustomer&&(!customerName.trim()||!customerPhone.trim())){
      setMessage('Nama dan WhatsApp pelanggan wajib diisi.');return
    }
    if(Number(paymentAmount)<0){setMessage('Nominal pembayaran tidak valid.');return}
    if(Number(paymentAmount)>total&&method!=='cash'){
      setMessage('Pembayaran non-tunai tidak boleh melebihi total.');return
    }
    setBusy(true)
    try{
      let selectedCustomer=customerId
      let selectedName=customers.find(c=>c.id===customerId)?.name||''
      let selectedPhone=customers.find(c=>c.id===customerId)?.phone||''
      if(newCustomer){
        const {data,error}=await supabase.from('v100_customers')
          .insert({name:customerName.trim(),phone:customerPhone.trim(),address:customerAddress.trim()||null})
          .select().single()
        if(error)throw error
        selectedCustomer=data.id; selectedName=data.name; selectedPhone=data.phone
      }
      const paid=Math.min(Number(paymentAmount||0),total)
      const {data,error}=await supabase.rpc('v100_create_order',{
        p_customer_id:selectedCustomer,p_discount:Number(discount),p_paid_amount:0,
        p_notes:notes.trim()||null,p_due_at:dueAt?new Date(dueAt).toISOString():null,
        p_items:items.map(i=>({
          service_id:i.service_id,service_name:i.service_name,unit:i.unit,
          price:i.price,quantity:i.quantity
        }))
      })
      if(error)throw error
      const result=Array.isArray(data)?data[0]:data
      if(!result?.order_id)throw new Error('Order tidak berhasil dibuat.')
      if(paid>0){
        const pay=await supabase.rpc('v100_add_payment',{
          p_order_id:result.order_id,p_amount:paid,p_method:method,p_notes:'Pembayaran dari Kasir'
        })
        if(pay.error)throw pay.error
      }
      let commissionWarning=''
      if(workerId||courierId){
        const assignment=await supabase.from('v113_order_commissions').insert({
          order_id:result.order_id,
          worker_id:workerId||null,
          worker_percent:workerId?workerPercent:0,
          courier_id:courierId||null,
          courier_percent:courierId?courierPercent:0
        })
        if(assignment.error)commissionWarning=`Order tersimpan, tetapi komisi belum tercatat: ${assignment.error.message}`
      }
      const saved:SuccessData={
        orderId:result.order_id,orderNo:result.order_no,total,subtotal,discount,paid,
        customer:selectedName,phone:selectedPhone,
        due:dueAt?new Date(dueAt).toLocaleString('id-ID'):'-',
        method,notes:notes.trim(),items:[...items],
        workerName:commissionEmployees.find(employee=>employee.id===workerId)?.full_name||'-',
        courierName:commissionEmployees.find(employee=>employee.id===courierId)?.full_name||'-'
      }
      setSuccess(saved)
      if(printSettings.auto_print){
        window.setTimeout(()=>printReceipt(saved,printSettings.paper_size),150)
      }
      reset(); if(commissionWarning)setMessage(commissionWarning); await load()
    }catch(err){setMessage(err instanceof Error?err.message:'Transaksi gagal.')}
    finally{setBusy(false)}
  }

  return <>
    <PageHeader
      eyebrow="KASIR ENTERPRISE"
      title="Kasir / Transaksi Baru"
      description="Buat order, terima pembayaran, cetak nota profesional, dan kirim WhatsApp."
    />
    {busy&&<div className="saving-overlay" role="status" aria-live="polite">
      <div className="saving-card"><span className="saving-spinner"/><b>Menyimpan transaksi...</b><small>Jangan tutup halaman.</small></div>
    </div>}
    <div className="cashier-layout">
      <form ref={formRef} className="panel cashier-form" onSubmit={submit} aria-busy={busy}>
        <section className="cashier-section">
          <div className="cashier-section-title">
            <div><b>1. Pelanggan</b><small>Pilih pelanggan lama atau tambah pelanggan baru.</small></div>
            <button type="button" className="secondary-button" onClick={()=>setNewCustomer(v=>!v)}>
              <UserPlus size={16}/>{newCustomer?'Pilih Pelanggan':'Pelanggan Baru'}
            </button>
          </div>
          {newCustomer
            ? <div className="form-grid-two">
                <label>Nama<input value={customerName} onChange={e=>setCustomerName(e.target.value)} required/></label>
                <label>WhatsApp<input value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} required/></label>
                <label className="full-field">Alamat<input value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)}/></label>
              </div>
            : <>
                <label className="search-box cashier-search">
                  <Search size={18}/><input ref={customerSearchRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari nama atau WhatsApp"/>
                </label>
                <select className="wide-select" value={customerId} onChange={e=>setCustomerId(e.target.value)}>
                  <option value="">Pilih pelanggan</option>
                  {filteredCustomers.map(c=><option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
                </select>
              </>
          }
        </section>

        <section className="cashier-section">
          <div className="cashier-section-title">
            <div><b>2. Layanan</b><small>Tambahkan berat atau jumlah cucian.</small></div>
            <button type="button" className="secondary-button" onClick={()=>addItem()}><Plus size={16}/>Tambah Layanan</button>
          </div>
          <div className="cashier-category-tabs">
            {serviceCategories.map(category=><button type="button" key={category} className={serviceCategory===category?'active':''} onClick={()=>setServiceCategory(category)}>{category}</button>)}
          </div>
          <div className="cashier-items">
            {items.length===0&&<div className="cashier-empty"><ShoppingCart size={28}/>Belum ada layanan.</div>}
            {items.map(item=><div className="cashier-item" key={item.key}>
              <select value={item.service_id} onChange={e=>updateService(item.key,e.target.value)}>
                {filteredServices.map(s=><option key={s.id} value={s.id}>{s.name} — {formatIDR(Number(s.price))}/{s.unit}</option>)}
              </select>
              <input
                type="text"
                inputMode="decimal"
                enterKeyHint="done"
                className="flex-number-input"
                value={quantityDraft[item.key]??String(item.quantity)}
                onFocus={e=>e.currentTarget.select()}
                onChange={e=>updateQtyDraft(item.key,e.target.value)}
                onBlur={()=>finishQtyEdit(item.key)}
                placeholder="0.1"
              />
              <b>{formatIDR(item.subtotal)}</b>
              <button type="button" onClick={()=>{
                setItems(cur=>cur.filter(i=>i.key!==item.key))
                setQuantityDraft(cur=>{const next={...cur};delete next[item.key];return next})
              }}><Trash2 size={17}/></button>
            </div>)}
          </div>
        </section>

        <section className="cashier-section">
          <div className="cashier-section-title">
            <div><b>3. Penanggung Jawab & Komisi</b><small>Pilih karyawan produksi dan kurir. Persentase diambil otomatis dari pengaturan gaji.</small></div>
          </div>
          <div className="form-grid-two">
            <label>Dikerjakan oleh
              <select value={workerId} onChange={e=>setWorkerId(e.target.value)}>
                <option value="">Tidak ditentukan</option>
                {commissionEmployees.map(employee=><option key={employee.id} value={employee.id}>{employee.full_name} — {employee.login_id}</option>)}
              </select>
              <small>{workerId?`Komisi produksi ${workerPercent.toFixed(2)}% = ${formatIDR(workerCommission)}`:'Opsional. Pilih karyawan yang mengerjakan order ini.'}</small>
            </label>
            <label>Kurir
              <select value={courierId} onChange={e=>setCourierId(e.target.value)}>
                <option value="">Tanpa kurir</option>
                {commissionEmployees.map(employee=><option key={employee.id} value={employee.id}>{employee.full_name} — {employee.login_id}</option>)}
              </select>
              <small>{courierId?`Komisi kurir ${courierPercent.toFixed(2)}% = ${formatIDR(courierCommission)}`:'Opsional. Komisi kurir menjadi hak setelah order Selesai & Lunas.'}</small>
            </label>
          </div>
        </section>

        <section className="cashier-section">
          <div className="cashier-section-title">
            <div><b>4. Pembayaran</b><small>Diskon, metode pembayaran, dan estimasi selesai.</small></div>
          </div>
          <div className="form-grid-two">
            <label>Jenis Diskon
              <select value={discountMode} onChange={e=>setDiscountMode(e.target.value as DiscountMode)}>
                <option value="nominal">Nominal Rupiah</option><option value="percent">Persen (%)</option>
              </select>
            </label>
            <label>Nilai Diskon
              <input type="number" min="0" max={discountMode==='percent'?100:undefined}
                value={discountValue} onChange={e=>setDiscountValue(Number(e.target.value))}/>
            </label>
            <label>Metode
              <select value={method} onChange={e=>setMethod(e.target.value as PayMethod)}>
                {methods.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label>Bayar Sekarang
              <input type="number" min="0" value={paymentAmount} onChange={e=>setPaymentAmount(Number(e.target.value))}/>
            </label>
            <div className="full-field quick-pay-row">
              <span>Pembayaran cepat</span>
              <button type="button" onClick={()=>quickPay('exact')}>Uang Pas</button>
              <button type="button" onClick={()=>quickPay('50k')}>Rp50.000</button>
              <button type="button" onClick={()=>quickPay('100k')}>Rp100.000</button>
            </div>
            <label>Estimasi Selesai<input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>
            <label className="full-field">Catatan<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Contoh: tanpa pewangi kuat"/></label>
          </div>
        </section>

        {message&&<div className="error-box">{message}</div>}
        {success&&<div className="cashier-success-panel cashier-success-pro">
          <div className="success-box"><CheckCircle2 size={18}/>Order {success.orderNo} berhasil dibuat.</div>
          <div className="receipt-actions">
            <button type="button" className="primary-button" onClick={()=>printReceipt(success,printSettings.paper_size)}><Printer size={16}/>Cetak Default ({printSettings.paper_size==='a4'?'A4':`${printSettings.paper_size} mm`})</button>
            <button type="button" className="secondary-button" onClick={()=>printReceipt(success,'58')}><Printer size={16}/>58 mm</button>
            <button type="button" className="secondary-button" onClick={()=>printReceipt(success,'80')}><Printer size={16}/>80 mm</button>
            <button type="button" className="secondary-button" onClick={()=>printReceipt(success,'a4')}><FileText size={16}/>A4 / PDF</button>
            <button type="button" className="whatsapp-button" onClick={sendOrderWhatsApp}><MessageCircle size={16}/>WhatsApp</button>
            <button type="button" className="secondary-button" onClick={async()=>{
              if(!success)return
              const url=`${window.location.origin}/track/${encodeURIComponent(success.orderNo)}`
              try{await navigator.clipboard.writeText(url);setMessage('Link tracking berhasil disalin.')}catch{setMessage(url)}
            }}>Copy Link Tracking</button>
          </div>
        </div>}
        <div className="cashier-actions">
          <button type="button" className="secondary-button" onClick={confirmReset} disabled={busy}>Bersihkan</button>
          <button className="primary-button" disabled={!canSubmit} title={!canSubmit?'Pilih pelanggan dan tambahkan layanan terlebih dahulu.':'Ctrl+Enter untuk menyimpan'}><WalletCards size={17}/>{busy?'Menyimpan...':'Simpan Transaksi'}</button>
        </div>
      </form>

      <aside className="cashier-summary">
        <section className="panel cashier-total-card">
          <span>Total Belanja</span><strong>{formatIDR(total)}</strong>
          <div><span>Subtotal</span><b>{formatIDR(subtotal)}</b></div>
          <div><span>Diskon</span><b>{formatIDR(discount)}</b></div>
          <div><span>Dibayar</span><b>{formatIDR(Math.min(paymentAmount,total))}</b></div>
          {method==='cash'&&paymentAmount>total&&<div className="cashier-change"><span>Kembalian</span><b>{formatIDR(change)}</b></div>}
          <div><span>Sisa Tagihan</span><b>{formatIDR(Math.max(0,total-paymentAmount))}</b></div>
        </section>

        <div className="cashier-summary-scroll">
          <section className="panel cashier-shortcuts">
            <header><b>Shortcut Kasir</b><span>V102 Stable</span></header>
            <div><kbd>F2</kbd><span>Cari pelanggan</span></div>
            <div><kbd>F4</kbd><span>Tambah layanan</span></div>
            <div><kbd>Ctrl + Enter</kbd><span>Simpan transaksi</span></div>
            <div><kbd>Esc</kbd><span>Bersihkan form</span></div>
          </section>
          <section className="panel cashier-pro-features">
            <header><QrCode size={20}/><b>Nota Enterprise</b></header>
            <p>Setelah transaksi tersimpan, tersedia:</p>
            <ul><li>Thermal 58 mm</li><li>Thermal 80 mm</li><li>A4 / Simpan PDF</li><li>QR status order</li><li>Barcode invoice</li></ul>
          </section>
          <section className="panel cashier-today">
            <header><b>Transaksi Hari Ini</b><span>{todayOrders.length}</span></header>
            {todayOrders.slice(0,8).map(o=><div key={o.id}>
              <span><b>{o.order_no}</b><small>{o.customer_name}</small></span><b>{formatIDR(Number(o.total))}</b>
            </div>)}
            {todayOrders.length===0&&<p>Belum ada transaksi hari ini.</p>}
          </section>
        </div>
      </aside>
    </div>
  </>
}
