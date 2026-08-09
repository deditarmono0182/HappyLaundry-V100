import { FormEvent, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Building2, CalendarCheck2, CheckCircle2, ClipboardCopy, CreditCard, ExternalLink, Eye, MapPin, MessageCircle, Printer, QrCode, Save, Send, Store, UsersRound } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { fillTemplate, openWhatsApp } from '../lib/whatsapp'
import type { StoreSettings } from '../types/settings'

type OnlinePaymentSettings={
  qris_enabled:boolean
  qris_image_url:string|null
  qris_merchant_name:string
  qris_note:string
  transfer_enabled:boolean
}

type BankAccount={
  id:string
  bank_name:string
  account_number:string
  account_name:string
  is_active:boolean
}

const onlineDefaults:OnlinePaymentSettings={
  qris_enabled:false,
  qris_image_url:null,
  qris_merchant_name:'HappyLaundry',
  qris_note:'Scan QRIS lalu upload bukti pembayaran.',
  transfer_enabled:false
}

const defaults: StoreSettings = {
  id: 1,
  business_name: 'HappyLaundry Babakan',
  tagline: 'Professional Laundry & Dry Cleaning',
  phone: '089666395940',
  address: 'Babakan, Cirebon',
  operational_hours: 'Senin–Minggu\n08.00–21.00 WIB',
  maps_url: '',
  receipt_footer: 'Terima kasih telah menggunakan HappyLaundry.',
  whatsapp_order_template: 'Halo {{pelanggan}}, cucian Anda sudah kami terima.\n\nNomor order: {{order}}\nTotal: {{total}}\nEstimasi selesai: {{estimasi}}\n\nTerima kasih.\n{{usaha}}',
  whatsapp_ready_template: 'Halo {{pelanggan}}, cucian dengan nomor order {{order}} sudah siap diambil.\n\nTerima kasih.\n{{usaha}}',
  updated_at: new Date().toISOString()
}

export function SettingsPage() {
  const navigate=useNavigate()
  const [form, setForm] = useState<StoreSettings>(defaults)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState('')
  const [onlinePayment,setOnlinePayment]=useState<OnlinePaymentSettings>(onlineDefaults)
  const [bankAccounts,setBankAccounts]=useState<BankAccount[]>([])
  const [waPreviewType,setWaPreviewType]=useState<'received'|'ready'>('received')
  const [copySuccess,setCopySuccess]=useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [storeResult,onlineResult,banksResult]=await Promise.all([
      supabase.from('v100_store_settings').select('*').eq('id',1).maybeSingle(),
      supabase.from('v1129_online_payment_settings').select('qris_enabled,qris_image_url,qris_merchant_name,qris_note,transfer_enabled').eq('id',1).maybeSingle(),
      supabase.from('v1129_bank_accounts').select('id,bank_name,account_number,account_name,is_active').eq('is_active',true).order('sort_order').order('bank_name')
    ])

    if(storeResult.error)setMessage(storeResult.error.message)
    else if(storeResult.data)setForm(storeResult.data as StoreSettings)

    // Payment Online V112.9 is optional for old databases. Preview WhatsApp still works if unavailable.
    if(!onlineResult.error&&onlineResult.data)setOnlinePayment({...onlineDefaults,...onlineResult.data} as OnlinePaymentSettings)
    if(!banksResult.error)setBankAccounts((banksResult.data as BankAccount[])||[])

    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setMessage(''); setSuccess('')
    const payload = { ...form, id: 1, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('v100_store_settings').upsert(payload)
    if (error) setMessage(error.message)
    else setSuccess('Pengaturan berhasil disimpan.')
    setBusy(false)
  }


  const previewData={
    pelanggan:'Pelanggan Contoh',
    order:'HL-CONTOH-00001',
    total:'Rp 50.000',
    paid:'Rp 0',
    remaining:'Rp 50.000',
    estimasi:'Besok pukul 16.00',
    tracking:`${window.location.origin}/track/HL-CONTOH-00001`
  }

  const paymentMethodText=()=>{
    const methods:string[]=[]
    if(onlinePayment.qris_enabled)methods.push('QRIS')
    if(onlinePayment.transfer_enabled&&bankAccounts.length>0)methods.push('Transfer Bank')
    return methods.length?methods.join(' / '):'Belum diaktifkan Owner'
  }

  const previewWhatsAppText=()=>{
    const template=waPreviewType==='received'?form.whatsapp_order_template:form.whatsapp_ready_template
    const base=fillTemplate(template,{
      pelanggan:previewData.pelanggan,
      order:previewData.order,
      total:previewData.total,
      estimasi:previewData.estimasi,
      usaha:form.business_name
    })
    const payment=onlinePayment.qris_enabled||(onlinePayment.transfer_enabled&&bankAccounts.length>0)
      ? `\n\n💳 Pembayaran Online\nTotal: ${previewData.total}\nSudah dibayar: ${previewData.paid}\nSisa tagihan: ${previewData.remaining}\nMetode: ${paymentMethodText()}\n\nBuka tracking untuk melihat QRIS/rekening dan upload bukti pembayaran:\n${previewData.tracking}`
      : `\n\nCek status cucian:\n${previewData.tracking}`
    return `${base}${payment}`
  }

  const testWhatsApp=()=>{
    try{openWhatsApp(form.phone,previewWhatsAppText())}
    catch(error){setMessage(error instanceof Error?error.message:'WhatsApp gagal dibuka.')}
  }

  const copyWhatsAppPreview=async()=>{
    try{
      await navigator.clipboard.writeText(previewWhatsAppText())
      setCopySuccess('Pesan berhasil disalin.')
      window.setTimeout(()=>setCopySuccess(''),1800)
    }catch{
      setMessage('Browser tidak mengizinkan copy otomatis. Silakan salin pesan secara manual.')
    }
  }


  if (loading) return <section className="panel settings-loading">Memuat pengaturan...</section>

  return <>
    <PageHeader eyebrow="PENGATURAN" title="Profil Laundry & WhatsApp" description="Atur identitas usaha, jam operasional, Maps, nota, dan template pesan pelanggan." />
    <form className="settings-grid" onSubmit={submit}>
      <section className="panel settings-card">
        <header><Store size={21}/><div><b>Profil Usaha</b><small>Informasi utama HappyLaundry.</small></div></header>
        <label>Nama Usaha<input value={form.business_name} onChange={e=>setForm({...form,business_name:e.target.value})} required/></label>
        <label>Slogan<input value={form.tagline} onChange={e=>setForm({...form,tagline:e.target.value})}/></label>
        <label>WhatsApp Laundry<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="0896..." required/></label>
        <label>Alamat<textarea value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label>
        <label>Jam Operasional<textarea value={form.operational_hours} onChange={e=>setForm({...form,operational_hours:e.target.value})}/></label>
      </section>

      <section className="panel settings-card">
        <header><MapPin size={21}/><div><b>Lokasi & Nota</b><small>Maps dan pesan pada bagian bawah nota.</small></div></header>
        <label>Link Google Maps<input value={form.maps_url} onChange={e=>setForm({...form,maps_url:e.target.value})} placeholder="https://maps.app.goo.gl/..."/></label>
        {form.maps_url && <a className="settings-link" href={form.maps_url} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Buka lokasi</a>}
        <label>Catatan Bawah Nota<textarea value={form.receipt_footer} onChange={e=>setForm({...form,receipt_footer:e.target.value})}/></label>
      </section>

      <section className="panel settings-card settings-wide employee-settings-link">
        <header><UsersRound size={21}/><div><b>Karyawan & Hak Akses</b><small>Tambah karyawan dan tentukan akses Dashboard, Kasir, Order, QR Center, Produksi, Pelanggan, dan Layanan.</small></div></header>
        <button type="button" className="primary-button" onClick={()=>navigate('/settings/employees')}><UsersRound size={17}/>Kelola Karyawan</button>
      </section>

      <section className="panel settings-card settings-wide employee-settings-link">
        <header><Activity size={21}/><div><b>Riwayat & Audit Karyawan</b><small>Lihat login berhasil/gagal dan aktivitas akun internal HappyLaundry.</small></div></header>
        <button type="button" className="secondary-button" onClick={()=>navigate('/settings/audit')}><Activity size={17}/>Buka Riwayat</button>
      </section>

      <section className="panel settings-card settings-wide employee-settings-link">
        <header><Printer size={21}/><div><b>Pengaturan Print Nota</b><small>Atur thermal 58/80 mm, A4, template, font, QR tracking, barcode, copy, dan preview nota.</small></div></header>
        <button type="button" className="primary-button" onClick={()=>navigate('/settings/print')}><Printer size={17}/>Buka Pengaturan Print</button>
      </section>

      <section className="panel settings-card settings-wide employee-settings-link">
        <header><CreditCard size={21}/><div><b>Pembayaran Online</b><small>Owner mengatur QRIS dan rekening bank yang tampil otomatis di Tracking Pelanggan.</small></div></header>
        <button type="button" className="primary-button" onClick={()=>navigate('/settings/online-payment')}><CreditCard size={17}/>Atur QRIS & Rekening</button>
      </section>

      <section className="panel settings-card settings-wide employee-settings-link">
        <header><CalendarCheck2 size={21}/><div><b>Pengaturan Absensi Karyawan</b><small>Kelola QR Absen, koordinat toko, radius GPS, dan batas jam. Bisa dikelola Owner dari mana saja.</small></div></header>
        <button type="button" className="primary-button" onClick={()=>navigate('/settings/attendance')}><CalendarCheck2 size={17}/>Buka Pengaturan Absensi</button>
      </section>

      <section className="panel settings-card settings-wide whatsapp-settings-section">
        <header><MessageCircle size={21}/><div><b>Template & Preview WhatsApp</b><small>Edit template dan lihat contoh pemberitahuan pelanggan termasuk pembayaran QRIS/Transfer.</small></div></header>

        <div className="settings-template-grid">
          <label>Pesan Order Diterima<textarea rows={9} value={form.whatsapp_order_template} onChange={e=>setForm({...form,whatsapp_order_template:e.target.value})}/></label>
          <label>Pesan Siap Diambil<textarea rows={9} value={form.whatsapp_ready_template} onChange={e=>setForm({...form,whatsapp_ready_template:e.target.value})}/></label>
        </div>
        <small className="wa-template-help">Variabel: {'{{pelanggan}}'}, {'{{order}}'}, {'{{total}}'}, {'{{estimasi}}'}, dan {'{{usaha}}'}.</small>

        <div className="wa-preview-toolbar">
          <div className="wa-preview-tabs">
            <button type="button" className={waPreviewType==='received'?'active':''} onClick={()=>setWaPreviewType('received')}>Order Diterima</button>
            <button type="button" className={waPreviewType==='ready'?'active':''} onClick={()=>setWaPreviewType('ready')}>Siap Diambil</button>
          </div>
          <span><Eye size={14}/>Preview otomatis</span>
        </div>

        <div className="wa-preview-layout">
          <div className="wa-phone-preview">
            <div className="wa-phone-head">
              <img src="/logo-happylaundry.jpg" alt="HappyLaundry"/>
              <div><b>{form.business_name||'HappyLaundry Babakan'}</b><small>Akun bisnis • Preview</small></div>
            </div>
            <div className="wa-chat-bg">
              <div className="wa-preview-bubble">
                <p>{previewWhatsAppText()}</p>
                <small>09.41 ✓✓</small>
              </div>
            </div>
          </div>

          <div className="wa-payment-preview">
            <div className="wa-payment-preview-head">
              <CreditCard size={19}/>
              <div><b>Pembayaran Online</b><small>Data aktif dari Pengaturan Owner</small></div>
            </div>

            <div className="wa-payment-total"><span>Sisa Tagihan</span><b>{previewData.remaining}</b></div>

            {onlinePayment.qris_enabled
              ? <div className="wa-qris-preview-card">
                  <div className="wa-method-title"><QrCode size={17}/><b>QRIS</b></div>
                  {onlinePayment.qris_image_url
                    ? <img src={onlinePayment.qris_image_url} alt="QRIS pembayaran"/>
                    : <div className="wa-preview-empty"><QrCode size={34}/><span>QRIS aktif, gambar belum tersedia</span></div>}
                  <strong>{onlinePayment.qris_merchant_name||form.business_name}</strong>
                  <small>{onlinePayment.qris_note}</small>
                </div>
              : <div className="wa-payment-disabled"><QrCode size={18}/>QRIS belum diaktifkan.</div>}

            {onlinePayment.transfer_enabled&&bankAccounts.length>0
              ? <div className="wa-bank-preview-list">
                  {bankAccounts.map(bank=><article key={bank.id}>
                    <Building2 size={18}/>
                    <span><b>{bank.bank_name}</b><strong>{bank.account_number}</strong><small>a.n. {bank.account_name}</small></span>
                  </article>)}
                </div>
              : <div className="wa-payment-disabled"><Building2 size={18}/>Transfer Bank belum diaktifkan / belum ada rekening aktif.</div>}

            <div className="wa-tracking-preview">
              <ExternalLink size={16}/><span><b>Link Tracking</b><small>{previewData.tracking}</small></span>
            </div>
          </div>
        </div>

        <div className="wa-preview-actions">
          <button type="button" className="secondary-button" onClick={()=>void copyWhatsAppPreview()}><ClipboardCopy size={16}/>{copySuccess||'Copy Pesan'}</button>
          <button type="button" className="primary-button" onClick={testWhatsApp}><Send size={16}/>Kirim WhatsApp Uji</button>
          <button type="button" className="secondary-button" onClick={()=>navigate('/settings/online-payment')}><CreditCard size={16}/>Atur QRIS & Rekening</button>
        </div>
        <div className="wa-preview-note">Catatan: tombol WhatsApp mengirim <b>teks + link tracking</b>. Gambar QRIS dan rekening dilihat pelanggan melalui link tracking agar selalu memakai data pembayaran Owner yang terbaru.</div>
      </section>

      {message && <div className="error-box settings-wide">{message}</div>}
      {success && <div className="success-box settings-wide"><CheckCircle2 size={18}/>{success}</div>}
      <div className="settings-actions settings-wide"><button className="primary-button" disabled={busy}><Save size={17}/>{busy?'Menyimpan...':'Simpan Pengaturan'}</button></div>
    </form>
  </>
}
