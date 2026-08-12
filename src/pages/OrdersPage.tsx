import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Eye,
  FileSpreadsheet,
  FileText,
  ExternalLink,
  Image,
  PackageCheck,
  Plus,
  Printer,
  Search,
  Truck,
  ShoppingBag,
  Trash2
} from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { downloadXls, printPdf } from '../lib/exportData'
import { useAuth } from '../lib/auth'
import { formatRupiah } from '../lib/format'
import { paymentLabels, paymentStatus, statusLabels } from '../lib/order'
import { supabase } from '../lib/supabase'
import { ownerDeleteDirect, removeDeleteFiles, requestDelete } from '../lib/deleteApproval'
import type { Customer, Service } from '../types/master'
import type { OrderItemDraft, OrderRow, OrderStatus } from '../types/order'

const emptyOrder = {
  customer_id: '',
  discount: 0,
  paid_amount: 0,
  notes: '',
  due_at: ''
}

const statusFlow: OrderStatus[] = ['received', 'washing', 'drying', 'ironing', 'packing', 'ready', 'completed']

type OrderServiceItem={
  order_id:string
  service_name:string
  unit:string
  quantity:number
}

type DeliveryProof={
  id:string
  order_id:string
  order_no:string
  photo_url:string
  photo_path:string
  note:string|null
  delivered_at:string
  confirmed_by_name:string|null
}

type OrderCommissionAssignment={
  order_id:string
  worker_id:string|null
  courier_id:string|null
}

type CommissionEmployeeName={
  id:string
  full_name:string
  login_id:string
}

export function OrdersPage() {
  const navigate=useNavigate()
  const [searchParams]=useSearchParams()
  const {profile}=useAuth()
  const [rows, setRows] = useState<OrderRow[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [orderServiceItems, setOrderServiceItems] = useState<OrderServiceItem[]>([])
  const [query, setQuery] = useState('')
  const [paymentFilter,setPaymentFilter]=useState<'all'|'unpaid'|'partial'|'paid'>('all')
  const [statusFilter,setStatusFilter]=useState<'all'|OrderStatus>('all')
  const [statusBusyId,setStatusBusyId]=useState<string|null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [detail, setDetail] = useState<OrderRow | null>(null)
  const [form, setForm] = useState(emptyOrder)
  const [items, setItems] = useState<OrderItemDraft[]>([])
  const [quantityDraft, setQuantityDraft] = useState<Record<string,string>>({})
  const [deliveryProofs,setDeliveryProofs]=useState<DeliveryProof[]>([])
  const [commissionAssignments,setCommissionAssignments]=useState<OrderCommissionAssignment[]>([])
  const [commissionEmployeeNames,setCommissionEmployeeNames]=useState<CommissionEmployeeName[]>([])
  const [deliveryOrder,setDeliveryOrder]=useState<OrderRow|null>(null)
  const [deliveryFile,setDeliveryFile]=useState<File|null>(null)
  const [deliveryPreview,setDeliveryPreview]=useState('')
  const [deliveryNote,setDeliveryNote]=useState('')
  const [deliveryBusy,setDeliveryBusy]=useState(false)
  const [deleteTarget,setDeleteTarget]=useState<OrderRow|null>(null)
  const [deleteReason,setDeleteReason]=useState('')
  const [deletePhrase,setDeletePhrase]=useState('')
  const [deleteBusy,setDeleteBusy]=useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setMessage('')
    const [ordersResult, customersResult, servicesResult, orderItemsResult, deliveryResult, commissionResult, commissionEmployeesResult] = await Promise.all([
      supabase
        .from('v100_orders_view')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('v100_customers')
        .select('id, store_id, name, phone, address, notes, created_at')
        .order('name'),
      supabase
        .from('v100_services')
        .select('id, store_id, name, category, unit, price, duration_hours, is_active, created_at')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('v100_order_items')
        .select('order_id,service_name,unit,quantity')
        .order('created_at'),
      supabase
        .from('v112_delivery_proofs')
        .select('id,order_id,order_no,photo_url,photo_path,note,delivered_at,confirmed_by_name')
        .order('delivered_at',{ascending:false}),
      supabase
        .from('v113_order_commissions')
        .select('order_id,worker_id,courier_id'),
      supabase.from('v109_users').select('id,full_name,login_id')
    ])

    const error = ordersResult.error || customersResult.error || servicesResult.error || orderItemsResult.error || deliveryResult.error || commissionResult.error || commissionEmployeesResult.error
    if (error) setMessage(error.message)
    else {
      setRows((ordersResult.data as OrderRow[]) || [])
      setCustomers((customersResult.data as Customer[]) || [])
      setServices((servicesResult.data as Service[]) || [])
      setOrderServiceItems((orderItemsResult.data as OrderServiceItem[]) || [])
      setDeliveryProofs((deliveryResult.data as DeliveryProof[]) || [])
      setCommissionAssignments((commissionResult.data as OrderCommissionAssignment[]) || [])
      setCommissionEmployeeNames((commissionEmployeesResult.data as CommissionEmployeeName[]) || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(()=>{
    const orderParam=searchParams.get('order')?.trim()
    const customerParam=searchParams.get('customer')?.trim()

    if(orderParam){
      setQuery(orderParam)
      if(rows.length){
        const found=rows.find(row=>row.order_no.toLowerCase()===orderParam.toLowerCase())
        if(found)setDetail(found)
      }
      return
    }

    if(customerParam){
      setQuery(customerParam)
    }
  },[searchParams,rows])

  const serviceItemsByOrder=useMemo(()=>{
    const map=new Map<string,OrderServiceItem[]>()
    for(const item of orderServiceItems){
      const list=map.get(item.order_id)||[]
      list.push(item)
      map.set(item.order_id,list)
    }
    return map
  },[orderServiceItems])

  const serviceSummary=(orderId:string)=>{
    const list=serviceItemsByOrder.get(orderId)||[]
    if(!list.length)return 'Belum ada layanan'
    return list.map(item=>{
      const qty=Number(item.quantity||0)
      const formattedQty=Number.isInteger(qty)
        ? String(qty)
        : qty.toLocaleString('id-ID',{maximumFractionDigits:2})
      return `${item.service_name} ${formattedQty} ${item.unit}`
    }).join(' • ')
  }

  const deliveryProofByOrder=useMemo(()=>{
    const map=new Map<string,DeliveryProof>()
    for(const proof of deliveryProofs){
      if(!map.has(proof.order_id))map.set(proof.order_id,proof)
    }
    return map
  },[deliveryProofs])

  const openDelivery=(row:OrderRow)=>{
    setDeliveryOrder(row)
    setDeliveryFile(null)
    setDeliveryPreview('')
    setDeliveryNote('')
    setMessage('')
  }

  const chooseDeliveryFile=(file:File|null)=>{
    if(!file)return
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
      setMessage('Foto bukti harus JPG, PNG, atau WEBP.')
      return
    }
    if(file.size>5*1024*1024){
      setMessage('Ukuran foto maksimal 5 MB.')
      return
    }
    setDeliveryFile(file)
    const url=URL.createObjectURL(file)
    setDeliveryPreview(current=>{
      if(current.startsWith('blob:'))URL.revokeObjectURL(current)
      return url
    })
  }

  const submitDelivery=async()=>{
    if(!deliveryOrder)return
    if(!deliveryFile){
      setMessage('Foto bukti pengiriman wajib diambil atau dipilih.')
      return
    }

    if(!window.confirm(`${deliveryOrder.order_no}\nKonfirmasi barang sudah dikirim dan diterima pelanggan?`))return

    setDeliveryBusy(true)
    setMessage('')

    try{
      const ext=(deliveryFile.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg'
      const safeOrder=deliveryOrder.order_no.replace(/[^a-zA-Z0-9_-]/g,'_')
      const path=`${safeOrder}/${Date.now()}.${ext}`

      const upload=await supabase.storage
        .from('delivery-proofs')
        .upload(path,deliveryFile,{
          cacheControl:'3600',
          upsert:false,
          contentType:deliveryFile.type
        })

      if(upload.error)throw upload.error

      const publicData=supabase.storage.from('delivery-proofs').getPublicUrl(path)
      const photoUrl=publicData.data.publicUrl

      const proof=await supabase.from('v112_delivery_proofs').insert({
        order_id:deliveryOrder.id,
        order_no:deliveryOrder.order_no,
        photo_url:photoUrl,
        photo_path:path,
        note:deliveryNote.trim()||null,
        confirmed_by_name:profile?.full_name||profile?.login_id||'Karyawan',
        delivered_at:new Date().toISOString()
      })

      if(proof.error){
        await supabase.storage.from('delivery-proofs').remove([path])
        throw proof.error
      }

      const update=await supabase
        .from('v100_orders')
        .update({status:'completed',updated_at:new Date().toISOString()})
        .eq('id',deliveryOrder.id)

      if(update.error)throw update.error

      if(deliveryPreview.startsWith('blob:'))URL.revokeObjectURL(deliveryPreview)
      setDeliveryOrder(null)
      setDeliveryFile(null)
      setDeliveryPreview('')
      setDeliveryNote('')
      await load()
      window.alert(`${deliveryOrder.order_no} berhasil dikonfirmasi TELAH DIKIRIM. Bukti foto tersimpan.`)
    }catch(error){
      setMessage(error instanceof Error?error.message:'Konfirmasi pengiriman gagal.')
    }finally{
      setDeliveryBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const keyword=query.trim().toLowerCase()

    return rows.filter(row=>{
      if(paymentFilter!=='all'&&row.payment_status!==paymentFilter)return false
      if(statusFilter!=='all'&&row.status!==statusFilter)return false

      if(!keyword)return true

      const haystack=[
        row.order_no,
        row.customer_name,
        row.customer_phone,
        statusLabels[row.status],
        row.status,
        paymentLabels[row.payment_status],
        row.payment_status,
        serviceSummary(row.id)
      ].join(' ').toLowerCase()

      return haystack.includes(keyword)
    })
  },[query,rows,serviceItemsByOrder,paymentFilter,statusFilter])

  const overdueRows = useMemo(() => {
    const now = Date.now()
    return rows.filter(row => {
      if (!row.due_at) return false
      if (['ready','completed','cancelled'].includes(row.status)) return false
      return new Date(row.due_at).getTime() < now
    })
  }, [rows])

  const isOverdue = (row: OrderRow) => {
    if (!row.due_at) return false
    if (['ready','completed','cancelled'].includes(row.status)) return false
    return new Date(row.due_at).getTime() < Date.now()
  }

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.subtotal, 0),
    [items]
  )
  const total = Math.max(0, subtotal - Number(form.discount || 0))

  const openCreate = () => {
    setForm(emptyOrder)
    setItems([])
    setQuantityDraft({})
    setMessage('')
    setModalOpen(true)
  }

  const addItem = () => {
    const first = services[0]
    if (!first) {
      setMessage('Belum ada layanan aktif. Tambahkan layanan terlebih dahulu.')
      return
    }
    const key=crypto.randomUUID()
    setItems(current => [
      ...current,
      {
        key,
        service_id: first.id,
        service_name: first.name,
        unit: first.unit,
        price: Number(first.price),
        quantity: 1,
        subtotal: Number(first.price)
      }
    ])
    setQuantityDraft(current=>({...current,[key]:'1'}))
  }

  const changeService = (key: string, serviceId: string) => {
    const service = services.find(row => row.id === serviceId)
    if (!service) return
    setItems(current => current.map(item =>
      item.key === key
        ? {
            ...item,
            service_id: service.id,
            service_name: service.name,
            unit: service.unit,
            price: Number(service.price),
            subtotal: Number(service.price) * item.quantity
          }
        : item
    ))
  }

  const parseFlexibleNumber=(value:string)=>{
    const normalized=value.replace(',','.').trim()
    if(!normalized||normalized==='.'||normalized==='-')return null
    const parsed=Number(normalized)
    return Number.isFinite(parsed)?parsed:null
  }

  const changeQuantityDraft=(key:string,value:string)=>{
    const cleaned=value.replace(/[^0-9.,]/g,'')
    setQuantityDraft(current=>({...current,[key]:cleaned}))
    const parsed=parseFlexibleNumber(cleaned)
    if(parsed===null||parsed<=0)return
    setItems(current=>current.map(item =>
      item.key===key
        ? {...item,quantity:parsed,subtotal:item.price*parsed}
        : item
    ))
  }

  const finishQuantityEdit=(key:string)=>{
    const parsed=parseFlexibleNumber(quantityDraft[key]??'')
    const safe=parsed!==null&&parsed>0?parsed:.1
    setQuantityDraft(current=>({...current,[key]:String(safe)}))
    setItems(current=>current.map(item =>
      item.key===key
        ? {...item,quantity:safe,subtotal:item.price*safe}
        : item
    ))
  }

  const removeItem = (key: string) => {
    setItems(current => current.filter(item => item.key !== key))
    setQuantityDraft(current=>{const next={...current};delete next[key];return next})
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setMessage('')

    if (!form.customer_id) {
      setMessage('Pilih pelanggan.')
      return
    }
    if (items.length === 0) {
      setMessage('Tambahkan minimal satu layanan.')
      return
    }
    if (Number(form.paid_amount) > total) {
      setMessage('Pembayaran awal tidak boleh lebih besar dari total.')
      return
    }

    setBusy(true)
    const { data, error } = await supabase.rpc('v100_create_order', {
      p_customer_id: form.customer_id,
      p_discount: Number(form.discount || 0),
      p_paid_amount: Number(form.paid_amount || 0),
      p_notes: form.notes.trim() || null,
      p_due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      p_items: items.map(item => ({
        service_id: item.service_id,
        service_name: item.service_name,
        unit: item.unit,
        price: item.price,
        quantity: item.quantity
      }))
    })

    if (error) setMessage(error.message)
    else {
      setModalOpen(false)
      await load()
      const orderNo = Array.isArray(data) ? data[0]?.order_no : data?.order_no
      if (orderNo) window.setTimeout(() => window.alert(`Order ${orderNo} berhasil dibuat.`), 100)
    }
    setBusy(false)
  }

  const advanceStatus=async(row:OrderRow)=>{
    const index=statusFlow.indexOf(row.status)
    if(index<0||index>=statusFlow.length-1)return

    const nextStatus=statusFlow[index+1]
    const currentLabel=statusLabels[row.status]
    const nextLabel=statusLabels[nextStatus]

    if(!window.confirm(`${row.order_no}\nUbah proses dari "${currentLabel}" menjadi "${nextLabel}"?`))return

    setStatusBusyId(row.id)
    setMessage('')

    const{error}=await supabase
      .from('v100_orders')
      .update({status:nextStatus,updated_at:new Date().toISOString()})
      .eq('id',row.id)

    if(error){
      setMessage(error.message)
    }else{
      await load()
    }

    setStatusBusyId(null)
  }

  const orderExport=(exportRows:OrderRow[],label:string)=>({
    title:'Data Order Laundry',
    filename:`order-laundry-${new Date().toISOString().slice(0,10)}-${label.toLowerCase().replace(/\s+/g,'-')}`,
    subtitle:`${label} • ${new Date().toLocaleString('id-ID')}`,
    headers:[
      'No. Order','Pelanggan','Telepon','Layanan',
      'Status Cucian','Status Pembayaran',
      'Subtotal','Diskon','Total','Sudah Bayar','Piutang',
      'Estimasi Selesai','Dibuat'
    ],
    rows:exportRows.map(row=>[
      row.order_no,
      row.customer_name,
      row.customer_phone,
      serviceSummary(row.id),
      statusLabels[row.status],
      paymentLabels[row.payment_status],
      Number(row.subtotal||0),
      Number(row.discount||0),
      Number(row.total||0),
      Number(row.paid_amount||0),
      Math.max(0,Number(row.total||0)-Number(row.paid_amount||0)),
      row.due_at?new Date(row.due_at).toLocaleString('id-ID'):'-',
      new Date(row.created_at).toLocaleString('id-ID')
    ]),
    summary:[
      ['Jumlah Order',exportRows.length],
      ['Total Nilai Order',Math.round(exportRows.reduce((sum,row)=>sum+Number(row.total||0),0))],
      ['Total Sudah Bayar',Math.round(exportRows.reduce((sum,row)=>sum+Number(row.paid_amount||0),0))],
      ['Total Piutang',Math.round(exportRows.reduce((sum,row)=>sum+Math.max(0,Number(row.total||0)-Number(row.paid_amount||0)),0))]
    ] as Array<[string,string|number]>
  })

  const filteredLabel=()=>{
    const payment=paymentFilter==='all'?'Semua Pembayaran':paymentLabels[paymentFilter]
    const status=statusFilter==='all'?'Semua Status Cucian':statusLabels[statusFilter]
    return `Filter: ${status} • ${payment}`
  }

  const openCustomerTracking=(row:OrderRow)=>{
    navigate(`/track/${encodeURIComponent(row.order_no)}?app=1&from=${encodeURIComponent(`/orders?order=${row.order_no}`)}`)
  }

  const submitDeleteOrder=async()=>{
    if(!deleteTarget)return
    if(deleteReason.trim().length<5){
      setMessage('Alasan penghapusan minimal 5 karakter.')
      return
    }
    const isOwner=profile?.role==='owner'
    if(isOwner&&deletePhrase!=='HAPUS ORDER'){
      setMessage('Owner harus mengetik HAPUS ORDER untuk menghapus langsung.')
      return
    }

    setDeleteBusy(true);setMessage('')
    try{
      if(isOwner){
        const {data,error}=await ownerDeleteDirect('order',deleteTarget.id,deleteReason.trim())
        if(error)throw error
        await removeDeleteFiles(data)
        window.alert(`${deleteTarget.order_no} berhasil dihapus oleh Owner.`)
      }else{
        const {error}=await requestDelete('order',deleteTarget.id,deleteReason.trim())
        if(error)throw error
        window.dispatchEvent(new Event('happylaundry-delete-requests-changed'))
        window.alert(`Permintaan hapus ${deleteTarget.order_no} sudah dikirim ke Owner.`)
      }
      setDeleteTarget(null);setDeleteReason('');setDeletePhrase('')
      await load()
    }catch(error){
      setMessage(error instanceof Error?error.message:'Permintaan hapus gagal.')
    }finally{setDeleteBusy(false)}
  }

  const commissionAssignmentMap=useMemo(()=>new Map(commissionAssignments.map(item=>[item.order_id,item])),[commissionAssignments])
  const commissionEmployeeNameMap=useMemo(()=>new Map(commissionEmployeeNames.map(item=>[item.id,item.full_name])),[commissionEmployeeNames])

  const printReceipt=(row:OrderRow)=>{
    const printWindow=window.open('','_blank','width=520,height=850')
    if(!printWindow)return

    const serviceRows=(serviceItemsByOrder.get(row.id)||[])
      .map(item=>{
        const qty=Number(item.quantity||0)
        const formattedQty=Number.isInteger(qty)
          ? String(qty)
          : qty.toLocaleString('id-ID',{maximumFractionDigits:2})
        return `<div class="service-row"><span>${item.service_name}</span><b>${formattedQty} ${item.unit}</b></div>`
      })
      .join('')

    const closeFallback=`${window.location.origin}/orders?order=${encodeURIComponent(row.order_no)}`
    const trackingUrl=`${window.location.origin}/track/${encodeURIComponent(row.order_no)}`
    const qrUrl=`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(trackingUrl)}`
    const commissionAssignment=commissionAssignmentMap.get(row.id)
    const workerName=commissionAssignment?.worker_id?commissionEmployeeNameMap.get(commissionAssignment.worker_id)||'-':'-'
    const courierName=commissionAssignment?.courier_id?commissionEmployeeNameMap.get(commissionAssignment.courier_id)||'-':'-'

    printWindow.document.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
        <title>Cetak Ulang ${row.order_no}</title>
        <style>
          @page{size:58mm auto;margin:3mm}
          *{box-sizing:border-box}
          body{
            font-family:Arial,sans-serif;
            width:58mm;
            max-width:100%;
            margin:0 auto;
            padding:4mm;
            color:#111;
            font-size:11px
          }
          h2,p{margin:0 0 5px;text-align:center}
          .line{border-top:1px dashed #111;margin:8px 0}
          .row,.service-row{
            display:flex;
            justify-content:space-between;
            gap:8px;
            font-size:11px;
            margin:5px 0
          }
          .row span:first-child{color:#444}
          .service-row span{max-width:65%}
          .strong{font-weight:800;font-size:13px}
          .small{font-size:10px}
          .receipt-qr{width:92px;height:92px;display:block;margin:8px auto 4px}
          .scan-caption{text-align:center;font-size:9px;margin:2px 0}
          .tracking-link{text-align:center;font-size:8px;word-break:break-all;margin:2px 0}

          .reprint-label{
            display:block;
            width:max-content;
            margin:0 auto 8px;
            padding:3px 7px;
            border:1px solid #aaa;
            border-radius:999px;
            font-size:8px;
            font-weight:800
          }
          .preview-actions{
            display:grid;
            gap:8px;
            margin-top:14px
          }
          .preview-actions button{
            min-height:44px;
            border-radius:9px;
            font-weight:850;
            cursor:pointer
          }
          .print-btn{border:0;background:#087d55;color:#fff}
          .close-btn{border:1px solid #bdd7e7;background:#eef7fc;color:#145f91}
          .top-close{
            position:fixed;
            top:max(12px,env(safe-area-inset-top));
            right:12px;
            width:44px;
            height:44px;
            display:grid;
            place-items:center;
            border:1px solid #c8dce8;
            border-radius:50%;
            background:#fff;
            color:#145f91;
            font:900 23px/1 Arial;
            box-shadow:0 8px 24px rgba(20,75,112,.16);
            cursor:pointer
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
            h2{font-size:24px!important}
            .row,.service-row{font-size:14px!important;margin:7px 0!important}
            .strong{font-size:18px!important}
            .small{font-size:12px!important}.receipt-qr{width:130px!important;height:130px!important}.scan-caption{font-size:11px!important}.tracking-link{font-size:9px!important}
            .line{margin:11px 0!important}
            .reprint-label{font-size:10px!important;padding:5px 9px!important}
            .preview-actions{margin-top:18px!important}
            .preview-actions button{min-height:50px!important;font-size:14px!important}
            .top-close{width:48px!important;height:48px!important;right:14px!important;top:max(12px,env(safe-area-inset-top))!important}
          }
          @media print{
            .preview-actions,.top-close{display:none!important}
          }
        </style>
        <script>
          function closePreview(){
            try{window.close()}catch(e){}
            setTimeout(function(){
              if(!window.closed)window.location.href=${JSON.stringify(closeFallback)}
            },180)
          }
        </script>
      </head>
      <body>
        <button class="top-close" type="button" onclick="closePreview()" aria-label="Tutup preview">×</button>
        <span class="reprint-label">CETAK ULANG NOTA</span>
        <h2>HappyLaundry</h2>
        <p class="small">Babakan, Cirebon</p>

        <div class="line"></div>
        <div class="row"><span>No. Order</span><b>${row.order_no}</b></div>
        <div class="row"><span>Pelanggan</span><b>${row.customer_name}</b></div>
        <div class="row"><span>WhatsApp</span><span>${row.customer_phone}</span></div>
        <div class="row"><span>Status Cucian</span><b>${statusLabels[row.status]}</b></div>
        <div class="row"><span>Pembayaran</span><b>${paymentLabels[row.payment_status]}</b></div>
        <div class="row"><span>Dikerjakan oleh</span><b>${workerName}</b></div>
        <div class="row"><span>Kurir</span><b>${courierName}</b></div>

        <div class="line"></div>
        <b>Layanan</b>
        ${serviceRows||'<p class="small">Rincian layanan tidak tersedia.</p>'}

        <div class="line"></div>
        <div class="row"><span>Subtotal</span><span>${formatRupiah(row.subtotal)}</span></div>
        <div class="row"><span>Diskon</span><span>${formatRupiah(row.discount)}</span></div>
        <div class="row strong"><span>Total</span><span>${formatRupiah(row.total)}</span></div>
        <div class="row"><span>Sudah Bayar</span><span>${formatRupiah(row.paid_amount)}</span></div>
        <div class="row"><span>Sisa</span><span>${formatRupiah(Math.max(0,row.total-row.paid_amount))}</span></div>

        <div class="line"></div>
        <img class="receipt-qr" src="${qrUrl}" alt="QR tracking ${row.order_no}">
        <p class="scan-caption"><b>Scan QR untuk tracking / buka order</b></p>
        <p class="tracking-link">${trackingUrl}</p>
        <p class="small">Terima kasih telah menggunakan HappyLaundry.</p>

        <div class="preview-actions">
          <button class="print-btn" type="button" onclick="window.print()">Cetak / Simpan PDF</button>
          <button class="close-btn" type="button" onclick="closePreview()">← Tutup Preview Nota</button>
        </div>
      </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <>
      <PageHeader
        eyebrow="OPERASIONAL"
        title="Order Laundry"
        description="Buat order, catat pembayaran, dan pantau proses cucian."
        action={
          <div className="order-header-actions">
            <button
              className="secondary-button"
              onClick={()=>downloadXls(orderExport(rows,'Semua Data'))}
              title="Export seluruh order tanpa mengikuti filter"
            >
              <FileSpreadsheet size={16}/>Export All
            </button>
            <button
              className="secondary-button"
              onClick={()=>printPdf(orderExport(filtered,filteredLabel()))}
              title="Export PDF sesuai filter yang sedang tampil"
            >
              <FileText size={16}/>PDF Filter
            </button>
            <button className="primary-button" onClick={openCreate}>
              <Plus size={18}/>Order Baru
            </button>
          </div>
        }
      />

      <section className="stats-grid compact-stats order-stats-grid">
        <article className="stat-card"><div className="stat-icon"><ShoppingBag size={22}/></div><div><span>Total Order</span><strong>{rows.length}</strong><small>Seluruh order</small></div></article>
        <article className="stat-card"><div className="stat-icon"><PackageCheck size={22}/></div><div><span>Siap Diambil</span><strong>{rows.filter(r => r.status === 'ready').length}</strong><small>Menunggu pelanggan</small></div></article>
        <article className={`stat-card order-overdue-card ${overdueRows.length>0?'has-overdue':''}`}><div className="stat-icon"><AlertTriangle size={22}/></div><div><span>Terlambat</span><strong>{overdueRows.length}</strong><small>Lewat estimasi selesai</small></div></article>
        <article className="stat-card"><div className="stat-icon"><CircleDollarSign size={22}/></div><div><span>Piutang</span><strong>{formatRupiah(rows.reduce((s,r)=>s+Math.max(0,Number(r.total)-Number(r.paid_amount)),0))}</strong><small>Sisa pembayaran</small></div></article>
      </section>

      <section className="panel data-panel order-panel">
        <div className="toolbar order-filter-toolbar">
          <label className="search-box order-search-box">
            <Search size={18}/>
            <input
              value={query}
              onChange={event=>setQuery(event.target.value)}
              placeholder="Cari order, pelanggan, telepon, layanan, status, atau pembayaran"
            />
          </label>

          <label className="order-filter-field">
            <span>Status Pembayaran</span>
            <select value={paymentFilter} onChange={e=>setPaymentFilter(e.target.value as typeof paymentFilter)}>
              <option value="all">Semua Pembayaran</option>
              <option value="unpaid">Belum Bayar</option>
              <option value="partial">DP / Sebagian</option>
              <option value="paid">Lunas</option>
            </select>
          </label>

          <label className="order-filter-field">
            <span>Status Cucian</span>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as typeof statusFilter)}>
              <option value="all">Semua Status</option>
              <option value="received">{statusLabels.received}</option>
              <option value="washing">{statusLabels.washing}</option>
              <option value="drying">{statusLabels.drying}</option>
              <option value="ironing">{statusLabels.ironing}</option>
              <option value="packing">{statusLabels.packing}</option>
              <option value="ready">{statusLabels.ready}</option>
              <option value="completed">{statusLabels.completed}</option>
              <option value="cancelled">{statusLabels.cancelled}</option>
            </select>
          </label>

          <button
            type="button"
            className="secondary-button order-reset-filter"
            onClick={()=>{
              setQuery('')
              setPaymentFilter('all')
              setStatusFilter('all')
            }}
          >
            Semua
          </button>

          <div className="order-toolbar-export">
            <button className="secondary-button" onClick={()=>downloadXls(orderExport(filtered,filteredLabel()))}>
              <FileSpreadsheet size={15}/>XLS Filter
            </button>
          </div>

          <span className="record-count">{filtered.length} order</span>
        </div>

        {message && <div className="error-box inline-message">{message}</div>}

        <div className="table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Pelanggan</th>
                <th>Layanan</th>
                <th>Status</th>
                <th>Pembayaran</th>
                <th>Total</th>
                <th>Estimasi Selesai</th>
                <th>Pengiriman</th>
                <th>Dibuat</th>
                <th className="order-actions-heading">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="table-empty">Memuat order...</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="table-empty"><ShoppingBag size={30}/>Belum ada order.</td></tr>
              )}
              {filtered.map(row => (
                <tr key={row.id}>
                  <td><b>{row.order_no}</b></td>
                  <td><b>{row.customer_name}</b><small>{row.customer_phone}</small></td>
                  <td className="order-service-cell">
                    {(serviceItemsByOrder.get(row.id)||[]).length
                      ? <div className="order-service-list">
                          {(serviceItemsByOrder.get(row.id)||[]).map((item,index)=>{
                            const qty=Number(item.quantity||0)
                            const formattedQty=Number.isInteger(qty)
                              ? String(qty)
                              : qty.toLocaleString('id-ID',{maximumFractionDigits:2})
                            return <span className="order-service-chip" key={`${row.id}-${index}`}>
                              <b>{item.service_name}</b>
                              <small>{formattedQty} {item.unit}</small>
                            </span>
                          })}
                        </div>
                      : <span className="order-service-empty">-</span>}
                  </td>
                  <td>
                    {statusFlow.indexOf(row.status)>=0&&statusFlow.indexOf(row.status)<statusFlow.length-1
                      ? <button
                          type="button"
                          className={`badge status-${row.status} clickable-order-status`}
                          onClick={()=>void advanceStatus(row)}
                          disabled={statusBusyId===row.id}
                          title={`Klik untuk lanjut ke ${statusLabels[statusFlow[statusFlow.indexOf(row.status)+1]]}`}
                        >
                          {statusBusyId===row.id?'Memproses...':statusLabels[row.status]}
                          <ChevronRight size={12}/>
                        </button>
                      : <span className={`badge status-${row.status}`}>{statusLabels[row.status]}</span>}
                  </td>
                  <td><span className={`badge payment-${row.payment_status}`}>{paymentLabels[row.payment_status]}</span><small>{formatRupiah(row.paid_amount)} / {formatRupiah(row.total)}</small></td>
                  <td><b>{formatRupiah(row.total)}</b></td>
                  <td className={isOverdue(row)?'order-due-cell overdue':''}>
                    {row.due_at
                      ? <><b>{new Date(row.due_at).toLocaleDateString('id-ID')}</b><small>{new Date(row.due_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}{isOverdue(row)?' • TERLAMBAT':''}</small></>
                      : <span className="order-no-due">Belum diatur</span>}
                  </td>
                  <td>
                    {deliveryProofByOrder.get(row.id)
                      ? <button
                          type="button"
                          className="delivery-proof-badge"
                          onClick={()=>window.open(deliveryProofByOrder.get(row.id)!.photo_url,'_blank')}
                          title="Lihat foto bukti pengiriman"
                        >
                          <Image size={13}/>Terkirim
                        </button>
                      : <button
                          type="button"
                          className="delivery-confirm-button"
                          onClick={()=>openDelivery(row)}
                          title="Konfirmasi kurir telah mengirim order"
                        >
                          <Truck size={13}/>Konfirmasi Kurir
                        </button>}
                  </td>
                  <td>{new Date(row.created_at).toLocaleDateString('id-ID')}</td>
                  <td>
                    <div className="row-actions">
                      <button className="order-view-button" onClick={() => setDetail(row)} aria-label="Lihat Detail" title="Lihat Detail"><Eye size={16}/></button>
                      <button
                        className="order-reprint-button"
                        onClick={()=>printReceipt(row)}
                        aria-label={`Cetak ulang nota ${row.order_no}`}
                        title="Cetak Ulang Nota"
                      >
                        <Printer size={15}/>
                        <span>Cetak Ulang Nota</span>
                      </button>

                      <button
                        type="button"
                        className="order-delete-request-button"
                        onClick={()=>{setDeleteTarget(row);setDeleteReason('');setDeletePhrase('');setMessage('')}}
                        title={profile?.role==='owner'?'Hapus Order':'Ajukan Hapus ke Owner'}
                      >
                        <Trash2 size={15}/>
                        <span className="delete-label">{profile?.role==='owner'?'Hapus':'Ajukan Hapus'}</span>
                      </button>

                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal title="Order Laundry Baru" onClose={() => setModalOpen(false)}>
          <form className="modal-form order-form" onSubmit={submit}>
            <label>
              Pelanggan
              <select value={form.customer_id} onChange={event => setForm({...form, customer_id: event.target.value})} required>
                <option value="">Pilih pelanggan</option>
                {customers.map(row => <option key={row.id} value={row.id}>{row.name} — {row.phone}</option>)}
              </select>
            </label>

            <div className="order-items-heading">
              <div><b>Rincian Layanan</b><small>Tambahkan berat atau jumlah item.</small></div>
              <button type="button" className="secondary-button" onClick={addItem}><Plus size={16}/> Tambah Layanan</button>
            </div>

            <div className="order-items">
              {items.length === 0 && <div className="mini-empty">Belum ada layanan.</div>}
              {items.map(item => (
                <div className="order-item-row" key={item.key}>
                  <label>
                    Layanan
                    <select value={item.service_id} onChange={event => changeService(item.key, event.target.value)}>
                      {services.map(service => <option key={service.id} value={service.id}>{service.name} — {formatRupiah(Number(service.price))}/{service.unit}</option>)}
                    </select>
                  </label>
                  <label>
                    Jumlah ({item.unit})
                    <input
                      type="text"
                      inputMode="decimal"
                      enterKeyHint="done"
                      className="flex-number-input"
                      value={quantityDraft[item.key]??String(item.quantity)}
                      onFocus={event=>event.currentTarget.select()}
                      onChange={event=>changeQuantityDraft(item.key,event.target.value)}
                      onBlur={()=>finishQuantityEdit(item.key)}
                      placeholder="0.1"
                    />
                  </label>
                  <div className="item-subtotal"><span>Subtotal</span><b>{formatRupiah(item.subtotal)}</b></div>
                  <button type="button" className="remove-item-button" onClick={() => removeItem(item.key)} aria-label="Hapus layanan"><Trash2 size={17}/></button>
                </div>
              ))}
            </div>

            <div className="form-grid-two">
              <label>Diskon<input type="number" min="0" value={form.discount} onChange={event => setForm({...form, discount: Number(event.target.value)})}/></label>
              <label>Pembayaran Awal<input type="number" min="0" value={form.paid_amount} onChange={event => setForm({...form, paid_amount: Number(event.target.value)})}/></label>
              <label>Estimasi Selesai<input type="datetime-local" value={form.due_at} onChange={event => setForm({...form, due_at: event.target.value})}/></label>
              <label>Catatan<input value={form.notes} onChange={event => setForm({...form, notes: event.target.value})} placeholder="Contoh: jangan pakai pewangi kuat"/></label>
            </div>

            <div className="order-total-box">
              <div><span>Subtotal</span><b>{formatRupiah(subtotal)}</b></div>
              <div><span>Diskon</span><b>{formatRupiah(Number(form.discount || 0))}</b></div>
              <div className="grand-total"><span>Total</span><b>{formatRupiah(total)}</b></div>
              <div><span>Status Pembayaran</span><b>{paymentLabels[paymentStatus(total, Number(form.paid_amount || 0))]}</b></div>
            </div>

            {message && <div className="error-box">{message}</div>}
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>Batal</button>
              <button className="primary-button" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Order'}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget&&(
        <Modal title={`${profile?.role==='owner'?'Hapus':'Ajukan Hapus'} Order — ${deleteTarget.order_no}`} onClose={()=>setDeleteTarget(null)}>
          <div className="modal-form delete-request-form">
            <div className="delete-request-warning">
              <AlertTriangle size={20}/>
              <div>
                <b>{profile?.role==='owner'?'Penghapusan permanen':'Memerlukan persetujuan Owner'}</b>
                <span>{profile?.role==='owner'
                  ? 'Order, item dan pembayaran terkait akan dihapus. Tindakan dicatat pada audit.'
                  : 'Order tidak akan terhapus sampai Owner menyetujui permintaan ini.'}</span>
              </div>
            </div>
            <label>Alasan Penghapusan<textarea rows={3} value={deleteReason} onChange={e=>setDeleteReason(e.target.value)} placeholder="Contoh: order salah input / duplikat"/></label>
            {profile?.role==='owner'&&<label>Konfirmasi Owner <input value={deletePhrase} onChange={e=>setDeletePhrase(e.target.value)} placeholder="Ketik HAPUS ORDER"/></label>}
            {message&&<div className="error-box">{message}</div>}
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={()=>setDeleteTarget(null)}>Batal</button>
              <button type="button" className={profile?.role==='owner'?'danger-button':'primary-button'} disabled={deleteBusy} onClick={()=>void submitDeleteOrder()}>
                <Trash2 size={16}/>{deleteBusy?'Memproses...':profile?.role==='owner'?'Hapus Order':'Kirim ke Owner'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deliveryOrder&&(
        <Modal title={`Konfirmasi Kurir — ${deliveryOrder.order_no}`} onClose={()=>{
          if(deliveryPreview.startsWith('blob:'))URL.revokeObjectURL(deliveryPreview)
          setDeliveryOrder(null)
          setDeliveryFile(null)
          setDeliveryPreview('')
          setDeliveryNote('')
        }}>
          <div className="modal-form delivery-proof-form">
            <div className="delivery-order-summary">
              <div><span>Nomor Order</span><b>{deliveryOrder.order_no}</b></div>
              <div><span>Pelanggan</span><b>{deliveryOrder.customer_name}</b></div>
              <div><span>WhatsApp</span><b>{deliveryOrder.customer_phone}</b></div>
            </div>

            <label className="delivery-photo-upload">
              <Truck size={22}/>
              <span>
                <b>{deliveryFile?'Ganti Foto Bukti':'Ambil / Upload Foto Bukti'}</b>
                <small>Foto paket/barang saat diserahkan kepada pelanggan.</small>
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={e=>chooseDeliveryFile(e.target.files?.[0]||null)}
              />
            </label>

            {deliveryPreview&&<div className="delivery-photo-preview">
              <img src={deliveryPreview} alt="Preview bukti pengiriman"/>
            </div>}

            <label>
              Catatan Pengiriman (opsional)
              <textarea
                rows={3}
                value={deliveryNote}
                onChange={e=>setDeliveryNote(e.target.value)}
                placeholder="Contoh: diterima Ibu Puspa di rumah"
              />
            </label>

            <div className="delivery-confirm-info">
              <PackageCheck size={18}/>
              <span>
                <b>Konfirmasi Telah Dikirim</b>
                <small>Foto akan disimpan pada nomor order ini dan status order otomatis menjadi Selesai.</small>
              </span>
            </div>

            {message&&<div className="error-box">{message}</div>}

            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={()=>setDeliveryOrder(null)}>Batal</button>
              <button
                type="button"
                className="primary-button"
                disabled={deliveryBusy||!deliveryFile}
                onClick={()=>void submitDelivery()}
              >
                <Truck size={16}/>{deliveryBusy?'Mengirim...':'Konfirmasi Telah Dikirim'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={`Detail ${detail.order_no}`} onClose={() => setDetail(null)}>
          <div className="order-detail">
            <div><span>Pelanggan</span><b>{detail.customer_name}</b></div>
            <div><span>WhatsApp</span><b>{detail.customer_phone}</b></div>
            <div className="order-detail-services">
              <span>Layanan</span>
              <div>
                {(serviceItemsByOrder.get(detail.id)||[]).length
                  ? (serviceItemsByOrder.get(detail.id)||[]).map((item,index)=>{
                      const qty=Number(item.quantity||0)
                      const formattedQty=Number.isInteger(qty)
                        ? String(qty)
                        : qty.toLocaleString('id-ID',{maximumFractionDigits:2})
                      return <b key={`${detail.id}-detail-${index}`}>{item.service_name} — {formattedQty} {item.unit}</b>
                    })
                  : <b>-</b>}
              </div>
            </div>
            <div className="order-detail-delivery">
              <span>Pengiriman Kurir</span>
              {deliveryProofByOrder.get(detail.id)
                ? <div className="order-detail-delivery-proof">
                    <a href={deliveryProofByOrder.get(detail.id)!.photo_url} target="_blank" rel="noreferrer">
                      <img src={deliveryProofByOrder.get(detail.id)!.photo_url} alt={`Bukti pengiriman ${detail.order_no}`}/>
                    </a>
                    <b>Telah Dikirim</b>
                    <small>{new Date(deliveryProofByOrder.get(detail.id)!.delivered_at).toLocaleString('id-ID')}</small>
                    <small>Konfirmasi: {deliveryProofByOrder.get(detail.id)!.confirmed_by_name||'-'}</small>
                    {deliveryProofByOrder.get(detail.id)!.note&&<small>{deliveryProofByOrder.get(detail.id)!.note}</small>}
                  </div>
                : <button type="button" className="secondary-button" onClick={()=>openDelivery(detail)}>
                    <Truck size={15}/>Konfirmasi Kurir
                  </button>}
            </div>
            <div><span>Status Cucian</span><b>{statusLabels[detail.status]}</b></div>
            <div><span>Status Pembayaran</span><b>{paymentLabels[detail.payment_status]}</b></div>
            <div><span>Estimasi Selesai</span><b className={isOverdue(detail)?'order-detail-overdue':''}>{detail.due_at?new Date(detail.due_at).toLocaleString('id-ID'):'Belum diatur'}{isOverdue(detail)?' • TERLAMBAT':''}</b></div>
            <div><span>Total</span><b>{formatRupiah(detail.total)}</b></div>
            <div><span>Sudah Bayar</span><b>{formatRupiah(detail.paid_amount)}</b></div>
            <div><span>Sisa</span><b>{formatRupiah(detail.total-detail.paid_amount)}</b></div>
            <div><span>Catatan</span><b>{detail.notes || '-'}</b></div>
            <div className="order-detail-tracking-row">
              <span>Tracking Pelanggan</span>
              <b>/track/{detail.order_no}</b>
            </div>
            <div className="form-actions order-detail-actions">
              <button
                type="button"
                className="secondary-button order-detail-tracking"
                onClick={()=>openCustomerTracking(detail)}
              >
                <ExternalLink size={16}/>Buka Tracking Pelanggan
              </button>
              <button className="secondary-button order-detail-reprint" onClick={()=>printReceipt(detail)}>
                <Printer size={16}/>Cetak Ulang Nota
              </button>
              <button className="primary-button" onClick={() => setDetail(null)}>
                <CheckCircle2 size={16}/>Tutup
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
