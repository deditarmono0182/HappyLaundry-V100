import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, Building2, Camera, Check, CheckCircle2, Clock3, CreditCard, Images, MapPin, MessageCircle, PackageCheck, QrCode, Search,
  Sparkles, Upload, WashingMachine
} from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { formatIDR } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { OrderStatus } from '../types/order'

interface TrackingItem {
  service_name: string
  unit: string
  quantity: number
}

interface TrackingData {
  order_no: string
  customer_name: string
  status: OrderStatus
  payment_status: string
  total: number
  paid_amount: number
  due_at: string|null
  created_at: string
  items: TrackingItem[]
  business_name: string
  phone: string
  address: string
  maps_url: string
  operational_hours: string
}


interface PublicBank{
  id:string
  bank_name:string
  account_number:string
  account_name:string
}
interface OnlinePaymentOptions{
  order_no:string
  remaining:number
  qris_enabled:boolean
  qris_image_url:string|null
  qris_merchant_name:string
  qris_note:string
  transfer_enabled:boolean
  banks:PublicBank[]
  pending_proof:{
    id:string
    method:'qris'|'transfer'
    amount:number
    status:string
    submitted_at:string
  }|null
}

const stages:Array<{key:OrderStatus;label:string}>=[
  {key:'received',label:'Diterima'},
  {key:'washing',label:'Dicuci'},
  {key:'drying',label:'Dikeringkan'},
  {key:'ironing',label:'Disetrika'},
  {key:'packing',label:'Packing'},
  {key:'ready',label:'Siap Diambil'}
]

const statusLabel:Record<string,string>={
  received:'Diterima',
  washing:'Dicuci',
  drying:'Dikeringkan',
  ironing:'Disetrika',
  packing:'Packing',
  ready:'Siap Diambil',
  completed:'Selesai',
  cancelled:'Dibatalkan'
}

export function PublicTrackingPage(){
  const navigate=useNavigate()
  const [searchParams]=useSearchParams()
  const {orderNo=''}=useParams()
  const appReturn=searchParams.get('app')==='1'
  const returnTo=searchParams.get('from')||'/'
  const [input,setInput]=useState(orderNo)
  const [data,setData]=useState<TrackingData|null>(null)
  const [loading,setLoading]=useState(false)
  const [message,setMessage]=useState('')
  const [now,setNow]=useState(Date.now())
  const [payOptions,setPayOptions]=useState<OnlinePaymentOptions|null>(null)
  const [payMethod,setPayMethod]=useState<'qris'|'transfer'>('qris')
  const [bankId,setBankId]=useState('')
  const [proofFile,setProofFile]=useState<File|null>(null)
  const [proofPreview,setProofPreview]=useState('')
  const [proofBusy,setProofBusy]=useState(false)
  const [proofMessage,setProofMessage]=useState('')

  const loadPaymentOptions=async(order:string)=>{
    const {data:result,error}=await supabase.rpc('v1129_public_payment_options',{p_order_no:order})
    if(error){setPayOptions(null);return}
    const options=result as OnlinePaymentOptions|null
    setPayOptions(options)
    if(options?.qris_enabled)setPayMethod('qris')
    else if(options?.transfer_enabled)setPayMethod('transfer')
    setBankId(options?.banks?.[0]?.id||'')
  }

  const load=async(value:string)=>{
    const normalized=value.trim().toUpperCase()
    if(!normalized)return
    setLoading(true);setMessage('');setData(null)
    const {data:result,error}=await supabase.rpc('v103_public_order_tracking',{p_order_no:normalized})
    if(error)setMessage('Status order belum tersedia. Pastikan SQL V103 sudah dijalankan.')
    else if(!result)setMessage('Nomor order tidak ditemukan.')
    else{
      setData(result as TrackingData)
      await loadPaymentOptions(normalized)
    }
    setLoading(false)
  }

  useEffect(()=>{if(orderNo)void load(orderNo)},[orderNo])

  useEffect(()=>{
    const timer=window.setInterval(()=>setNow(Date.now()),60000)
    return()=>window.clearInterval(timer)
  },[])

  const backToApp=()=>{
    // Internal tracking links carry ?app=1&from=/source.
    // Use replace so mobile/PWA does not bounce back into tracking again.
    if(appReturn){
      navigate(returnTo,{replace:true})
      return
    }
    if(window.history.length>1){
      window.history.back()
      return
    }
    navigate('/',{replace:true})
  }

  const currentIndex=useMemo(()=>{
    if(!data)return -1
    if(data.status==='completed')return stages.length
    return stages.findIndex(stage=>stage.key===data.status)
  },[data])

  const progress=useMemo(()=>{
    if(!data)return 0
    if(data.status==='completed')return 100
    if(currentIndex<0)return 0
    return Math.round(((currentIndex+1)/stages.length)*100)
  },[data,currentIndex])

  const countdown=useMemo(()=>{
    if(!data?.due_at)return 'Hubungi laundry'
    const diff=new Date(data.due_at).getTime()-now
    if(diff<=0)return data.status==='ready'||data.status==='completed'?'Sudah selesai':'Melewati estimasi'
    const minutes=Math.floor(diff/60000)
    const days=Math.floor(minutes/1440)
    const hours=Math.floor((minutes%1440)/60)
    const mins=minutes%60
    if(days>0)return `${days} hari ${hours} jam lagi`
    if(hours>0)return `${hours} jam ${mins} menit lagi`
    return `${Math.max(1,mins)} menit lagi`
  },[data,now])

  const dueLabel=useMemo(()=>{
    if(!data?.due_at)return ''
    return new Date(data.due_at).toLocaleString('id-ID',{
      weekday:'long',day:'2-digit',month:'long',year:'numeric',
      hour:'2-digit',minute:'2-digit'
    })
  },[data])

  const search=(event:React.FormEvent)=>{
    event.preventDefault()
    const value=input.trim()
    if(!value)return
    window.history.replaceState(null,'',`/track/${encodeURIComponent(value)}`)
    void load(value)
  }

  const wa=()=>{
    if(!data?.phone)return
    const phone=data.phone.replace(/\D/g,'').replace(/^0/,'62')
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(`Halo ${data.business_name}, saya ingin menanyakan order ${data.order_no}.`)}`,
      '_blank'
    )
  }

  const chooseProof=(file:File|null)=>{
    if(!file)return
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
      setProofMessage('Bukti pembayaran harus JPG, PNG, atau WEBP.');return
    }
    if(file.size>5*1024*1024){setProofMessage('Ukuran foto maksimal 5 MB.');return}
    setProofFile(file)
    setProofMessage('')
    const url=URL.createObjectURL(file)
    setProofPreview(current=>{
      if(current.startsWith('blob:'))URL.revokeObjectURL(current)
      return url
    })
  }

  const submitOnlinePayment=async()=>{
    if(!data||!payOptions||!proofFile)return
    if(payMethod==='transfer'&&!bankId){setProofMessage('Pilih rekening tujuan.');return}
    setProofBusy(true);setProofMessage('')
    try{
      const ext=(proofFile.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg'
      const safeOrder=data.order_no.replace(/[^a-zA-Z0-9_-]/g,'_')
      const path=`${safeOrder}/${Date.now()}-${crypto.randomUUID()}.${ext}`
      const upload=await supabase.storage.from('payment-proofs').upload(path,proofFile,{
        cacheControl:'3600',upsert:false,contentType:proofFile.type
      })
      if(upload.error)throw upload.error
      const submit=await supabase.rpc('v1129_submit_payment_proof',{
        p_order_no:data.order_no,
        p_method:payMethod,
        p_bank_account_id:payMethod==='transfer'?bankId:null,
        p_photo_path:path
      })
      if(submit.error){
        await supabase.storage.from('payment-proofs').remove([path])
        throw submit.error
      }
      if(proofPreview.startsWith('blob:'))URL.revokeObjectURL(proofPreview)
      setProofFile(null);setProofPreview('')
      setProofMessage('Bukti pembayaran berhasil dikirim. Menunggu konfirmasi HappyLaundry.')
      await loadPaymentOptions(data.order_no)
    }catch(e){setProofMessage(e instanceof Error?e.message:'Bukti pembayaran gagal dikirim.')}
    finally{setProofBusy(false)}
  }

  const isReady=data?.status==='ready'||data?.status==='completed'

  return <main className="tracking-page tracking-premium">
    {appReturn&&<button type="button" className="tracking-back-to-app" onClick={backToApp}>
      <ArrowLeft size={18}/>
      <span>Kembali ke Aplikasi</span>
    </button>}
    <header className="tracking-brand tracking-brand-premium">
      <img src="/logo-happylaundry.jpg" alt="HappyLaundry"/>
      <div><b>{data?.business_name||'HappyLaundry Babakan'}</b><span>Status Laundry Online</span></div>
    </header>

    <section className="tracking-card tracking-search-card">
      <h1>Lacak Status Cucian</h1>
      <p>Masukkan nomor order yang tertera pada nota.</p>
      <form onSubmit={search}>
        <Search size={19}/>
        <input value={input} onChange={e=>setInput(e.target.value)} placeholder="Contoh: HL-260807-00001"/>
        <button disabled={loading}>{loading?'Memeriksa...':'Lacak'}</button>
      </form>
      {message&&<div className="tracking-error">{message}</div>}
    </section>

    {data&&<section className="tracking-card tracking-result">
      {isReady&&<div className="tracking-ready-banner">
        <Sparkles size={26}/>
        <div>
          <b>{data.status==='completed'?'Laundry Anda sudah selesai':'Laundry Anda siap diambil!'}</b>
          <span>{data.status==='completed'?'Terima kasih telah menggunakan HappyLaundry.':'Silakan datang ke outlet untuk mengambil cucian Anda.'}</span>
        </div>
      </div>}

      <div className="tracking-order-head">
        <div>
          <span>Nomor Order</span>
          <strong>{data.order_no}</strong>
          <small>{data.customer_name}</small>
        </div>
        <span className={`tracking-status tracking-${data.status}`}>{statusLabel[data.status]||data.status}</span>
      </div>

      <div className="tracking-progress-meter">
        <div className="tracking-progress-top">
          <span>Progress Cucian</span>
          <b>{progress}%</b>
        </div>
        <div className="tracking-progress-bar"><i style={{width:`${progress}%`}}/></div>
      </div>

      <div className="tracking-progress">
        {stages.map((stage,index)=>{
          const done=index<currentIndex||data.status==='completed'
          const active=index===currentIndex&&data.status!=='completed'
          return <div className={`tracking-step ${done?'done':''} ${active?'active':''}`} key={stage.key}>
            <span>{done?<Check size={17}/>:active?<WashingMachine size={17}/>:index+1}</span>
            <b>{stage.label}</b>
          </div>
        })}
      </div>

      <div className="tracking-summary tracking-summary-premium">
        <div>
          <Clock3 size={20}/>
          <span>Estimasi selesai
            <b>{countdown}</b>
            {dueLabel&&<small>{dueLabel}</small>}
          </span>
        </div>
        <div>
          <PackageCheck size={20}/>
          <span>Total<b>{formatIDR(Number(data.total))}</b></span>
        </div>
        <div>
          <MessageCircle size={20}/>
          <span>Pembayaran
            <b>{Number(data.paid_amount)>=Number(data.total)?'Lunas':`Sisa ${formatIDR(Number(data.total)-Number(data.paid_amount))}`}</b>
          </span>
        </div>
      </div>


      {payOptions&&Number(payOptions.remaining)>0&&(payOptions.qris_enabled||payOptions.transfer_enabled)&&
        <div className="tracking-online-payment">
          <div className="tracking-payment-head">
            <div>
              <span>Pembayaran Online</span>
              <h2>Sisa {formatIDR(Number(payOptions.remaining))}</h2>
              <small>Bayar sesuai nominal sisa tagihan, lalu upload bukti.</small>
            </div>
            <CreditCard size={25}/>
          </div>

          {payOptions.pending_proof
            ? <div className="tracking-payment-pending">
                <CheckCircle2 size={22}/>
                <div>
                  <b>Menunggu Konfirmasi</b>
                  <span>Bukti {payOptions.pending_proof.method==='qris'?'QRIS':'Transfer Bank'} sebesar {formatIDR(Number(payOptions.pending_proof.amount))} sudah diterima.</span>
                  <small>{new Date(payOptions.pending_proof.submitted_at).toLocaleString('id-ID')}</small>
                </div>
              </div>
            : <>
                <div className="tracking-pay-methods">
                  {payOptions.qris_enabled&&<button type="button" className={payMethod==='qris'?'active':''} onClick={()=>setPayMethod('qris')}><QrCode size={18}/>QRIS</button>}
                  {payOptions.transfer_enabled&&payOptions.banks.length>0&&<button type="button" className={payMethod==='transfer'?'active':''} onClick={()=>setPayMethod('transfer')}><Building2 size={18}/>Transfer Bank</button>}
                </div>

                {payMethod==='qris'&&payOptions.qris_enabled&&<div className="tracking-qris-box">
                  {payOptions.qris_image_url&&<img src={payOptions.qris_image_url} alt="QRIS HappyLaundry"/>}
                  <b>{payOptions.qris_merchant_name||'HappyLaundry'}</b>
                  <span>{payOptions.qris_note||'Scan QRIS untuk melakukan pembayaran.'}</span>
                  <strong>{formatIDR(Number(payOptions.remaining))}</strong>
                </div>}

                {payMethod==='transfer'&&payOptions.transfer_enabled&&<div className="tracking-bank-options">
                  {payOptions.banks.map(bank=><label className={`tracking-bank-card ${bankId===bank.id?'active':''}`} key={bank.id}>
                    <input type="radio" name="bank" value={bank.id} checked={bankId===bank.id} onChange={()=>setBankId(bank.id)}/>
                    <span><b>{bank.bank_name}</b><strong>{bank.account_number}</strong><small>a.n. {bank.account_name}</small></span>
                  </label>)}
                  <div className="tracking-transfer-amount">Transfer tepat: <b>{formatIDR(Number(payOptions.remaining))}</b></div>
                </div>}

                <div className="tracking-proof-upload-block">
                  <div className="tracking-proof-upload-title">
                    <span><b>{proofFile?'Ganti Bukti Pembayaran':'Upload Bukti Pembayaran'}</b><small>Pilih dari galeri atau ambil foto langsung • JPG, PNG, WEBP • maksimal 5 MB</small></span>
                  </div>
                  <div className="tracking-proof-source-actions">
                    <label className="tracking-proof-source-button">
                      <Images size={19}/>
                      <span>Pilih dari Galeri</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>chooseProof(e.target.files?.[0]||null)}/>
                    </label>
                    <label className="tracking-proof-source-button">
                      <Camera size={19}/>
                      <span>Ambil Foto Kamera</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>chooseProof(e.target.files?.[0]||null)}/>
                    </label>
                  </div>
                </div>
                {proofPreview&&<img className="tracking-proof-preview" src={proofPreview} alt="Preview bukti pembayaran"/>}
                {proofMessage&&<div className={proofMessage.startsWith('Bukti pembayaran berhasil')?'tracking-payment-success':'tracking-error'}>{proofMessage}</div>}
                <button type="button" className="tracking-submit-proof" disabled={proofBusy||!proofFile} onClick={()=>void submitOnlinePayment()}>
                  <Upload size={17}/>{proofBusy?'Mengirim...':'Kirim Bukti Pembayaran'}
                </button>
                <p className="tracking-payment-note">Pembayaran baru dinyatakan <b>LUNAS</b> setelah dikonfirmasi Owner/karyawan HappyLaundry.</p>
              </>}
        </div>}

      <div className="tracking-items">
        <h2>Rincian Cucian</h2>
        {data.items?.map((item,index)=><div key={`${item.service_name}-${index}`}>
          <span>{item.service_name}</span>
          <b>{item.quantity} {item.unit}</b>
        </div>)}
      </div>

      <div className="tracking-business">
        <MapPin size={18}/>
        <div>
          <b>{data.business_name}</b>
          <span>{data.address}</span>
          <small>{data.operational_hours}</small>
        </div>
      </div>

      <div className="tracking-actions">
        {data.maps_url&&<a href={data.maps_url} target="_blank" rel="noreferrer"><MapPin size={16}/>Buka Maps</a>}
        <button onClick={wa}><MessageCircle size={16}/>Hubungi WhatsApp</button>
      </div>
    </section>}

    <footer className="tracking-footer">HappyLaundry Enterprise V103.2 • Status diperbarui oleh petugas laundry.</footer>
  </main>
}
