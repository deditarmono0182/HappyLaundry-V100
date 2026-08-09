import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2, ImagePlus, RotateCcw, Trash2, FileText, Printer, QrCode, Save, Settings2
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import {
  defaultReceiptPrintSettings,
  type ReceiptPaper,
  type ReceiptPrintSettings,
  type ReceiptTemplate
} from '../lib/receiptSettings'

export function PrintSettingsPage(){
  const[form,setForm]=useState<ReceiptPrintSettings>(defaultReceiptPrintSettings)
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const[success,setSuccess]=useState('')
  const[logoBusy,setLogoBusy]=useState(false)
  const[logoPreview,setLogoPreview]=useState('')

  const load=useCallback(async()=>{
    setLoading(true)
    const{data,error}=await supabase
      .from('v110_receipt_print_settings')
      .select('*')
      .eq('id',1)
      .maybeSingle()
    if(error)setMessage(error.message)
    else if(data){
      const next={...defaultReceiptPrintSettings,...data} as ReceiptPrintSettings
      setForm(next)
      setLogoPreview(next.logo_url||'/logo-happylaundry.jpg')
    }else{
      setLogoPreview('/logo-happylaundry.jpg')
    }
    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  const setBool=(key:keyof ReceiptPrintSettings,value:boolean)=>
    setForm(current=>({...current,[key]:value}))

  const uploadLogo=async(file:File)=>{
    setMessage('')
    setSuccess('')
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){
      setMessage('Logo harus berupa PNG, JPG/JPEG, atau WEBP.')
      return
    }
    if(file.size>2*1024*1024){
      setMessage('Ukuran logo maksimal 2 MB.')
      return
    }

    setLogoBusy(true)
    try{
      const ext=(file.name.split('.').pop()||'png').toLowerCase().replace(/[^a-z0-9]/g,'')||'png'
      const path=`receipt-logo/logo-${Date.now()}.${ext}`

      const{error:uploadError}=await supabase.storage
        .from('receipt-assets')
        .upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type})
      if(uploadError)throw uploadError

      const{data:publicData}=supabase.storage.from('receipt-assets').getPublicUrl(path)
      const url=publicData.publicUrl

      // Delete previous custom logo after new upload succeeds.
      if(form.logo_path){
        await supabase.storage.from('receipt-assets').remove([form.logo_path])
      }

      setForm(current=>({...current,logo_url:url,logo_path:path,show_logo:true}))
      setLogoPreview(url)
      setSuccess('Logo baru siap. Klik Simpan Pengaturan Print agar digunakan pada nota.')
    }catch(error){
      setMessage(error instanceof Error?error.message:'Upload logo gagal.')
    }finally{
      setLogoBusy(false)
    }
  }

  const removeCustomLogo=async()=>{
    setLogoBusy(true);setMessage('');setSuccess('')
    try{
      if(form.logo_path){
        const{error}=await supabase.storage.from('receipt-assets').remove([form.logo_path])
        if(error)throw error
      }
      setForm(current=>({...current,logo_url:'',logo_path:'',show_logo:false}))
      setLogoPreview('/logo-happylaundry.jpg')
      setSuccess('Logo custom dihapus. Klik Simpan Pengaturan Print.')
    }catch(error){
      setMessage(error instanceof Error?error.message:'Logo gagal dihapus.')
    }finally{
      setLogoBusy(false)
    }
  }

  const restoreDefaultLogo=async()=>{
    setLogoBusy(true);setMessage('');setSuccess('')
    try{
      if(form.logo_path){
        const{error}=await supabase.storage.from('receipt-assets').remove([form.logo_path])
        if(error)throw error
      }
      setForm(current=>({...current,logo_url:'',logo_path:'',show_logo:true}))
      setLogoPreview('/logo-happylaundry.jpg')
      setSuccess('Logo default HappyLaundry dipilih. Klik Simpan Pengaturan Print.')
    }catch(error){
      setMessage(error instanceof Error?error.message:'Gagal mengembalikan logo default.')
    }finally{
      setLogoBusy(false)
    }
  }

  const submit=async(event:FormEvent)=>{
    event.preventDefault()
    setBusy(true);setMessage('');setSuccess('')
    const payload={
      ...form,
      id:1,
      font_size:Math.min(18,Math.max(8,Number(form.font_size)||11)),
      copies:Math.min(3,Math.max(1,Number(form.copies)||1)),
      logo_width:Math.min(180,Math.max(30,Number(form.logo_width)||64)),
      updated_at:new Date().toISOString()
    }
    const{error}=await supabase
      .from('v110_receipt_print_settings')
      .upsert(payload,{onConflict:'id'})
    if(error)setMessage(error.message)
    else{
      setForm(payload)
      setSuccess('Pengaturan Print Nota berhasil disimpan dan akan dipakai pada cetak berikutnya.')
    }
    setBusy(false)
  }

  const width=form.paper_size==='58'?'58mm':form.paper_size==='80'?'80mm':'190mm'
  const previewFont=Math.min(16,Math.max(9,form.font_size))
  const preview=useMemo(()=>({
    tracking:`${window.location.origin}/track/HL-260808-00001`
  }),[])

  if(loading)return <section className="panel settings-loading">Memuat pengaturan print...</section>

  return <>
    <PageHeader
      eyebrow="PENGATURAN • PRINT NOTA"
      title="Pengaturan Print Nota"
      description="Atur ukuran kertas, template, font, QR tracking, barcode, jumlah copy, dan informasi yang tampil pada nota."
    />

    <div className="print-settings-note">
      <Printer size={18}/>
      <span>
        <b>Pemilihan printer fisik dilakukan di dialog Print Windows/iPhone/Android.</b>
        Browser/PWA tidak diizinkan memilih printer sistem secara otomatis. HappyLaundry menyimpan ukuran dan format nota.
      </span>
    </div>

    <form className="print-settings-layout" onSubmit={submit}>
      <div className="print-settings-controls">
        <section className="panel print-settings-card">
          <header><Printer size={20}/><div><b>Printer & Kertas</b><small>Format default saat tombol Cetak Default digunakan.</small></div></header>

          <label>Ukuran Kertas
            <select value={form.paper_size} onChange={e=>setForm({...form,paper_size:e.target.value as ReceiptPaper})}>
              <option value="58">Thermal 58 mm</option>
              <option value="80">Thermal 80 mm</option>
              <option value="a4">A4 / PDF</option>
            </select>
          </label>

          <label>Template Nota
            <select value={form.template} onChange={e=>setForm({...form,template:e.target.value as ReceiptTemplate})}>
              <option value="minimal">Minimalis</option>
              <option value="professional">Professional</option>
              <option value="premium">Premium</option>
            </select>
          </label>

          <div className="form-grid-two">
            <label>Ukuran Font
              <input type="number" min="8" max="18" value={form.font_size} onChange={e=>setForm({...form,font_size:Number(e.target.value)})}/>
            </label>
            <label>Jumlah Copy
              <select value={form.copies} onChange={e=>setForm({...form,copies:Number(e.target.value)})}>
                <option value={1}>1 Copy</option>
                <option value={2}>2 Copy</option>
                <option value={3}>3 Copy</option>
              </select>
            </label>
          </div>

          <label className="print-switch">
            <input type="checkbox" checked={form.auto_print} onChange={e=>setBool('auto_print',e.target.checked)}/>
            <span><b>Auto Print setelah transaksi</b><small>Membuka dialog print otomatis setelah order kasir berhasil.</small></span>
          </label>
        </section>

        <section className="panel print-settings-card receipt-logo-settings">
          <header><ImagePlus size={20}/><div><b>Logo Nota</b><small>Upload logo usaha dan atur ukuran/posisinya pada nota.</small></div></header>

          <div className="receipt-logo-editor">
            <div className="receipt-logo-preview-box">
              <img
                src={logoPreview||form.logo_url||'/logo-happylaundry.jpg'}
                alt="Preview logo nota"
                style={{
                  width:`${Math.min(180,Math.max(30,Number(form.logo_width)||64))}px`,
                  maxWidth:'90%',
                  objectFit:'contain'
                }}
              />
              <small>{form.logo_url?'Logo Custom':'Logo Default HappyLaundry'}</small>
            </div>

            <div className="receipt-logo-controls">
              <label className="receipt-logo-upload">
                <ImagePlus size={16}/>
                <span>{logoBusy?'Memproses...':'Upload Logo'}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={logoBusy}
                  onChange={e=>{
                    const file=e.target.files?.[0]
                    if(file)void uploadLogo(file)
                    e.currentTarget.value=''
                  }}
                />
              </label>

              <button type="button" className="secondary-button" disabled={logoBusy} onClick={()=>void restoreDefaultLogo()}>
                <RotateCcw size={16}/>Logo Default
              </button>

              <button type="button" className="secondary-button danger-logo-button" disabled={logoBusy||!form.logo_path} onClick={()=>void removeCustomLogo()}>
                <Trash2 size={16}/>Hapus Custom
              </button>
            </div>
          </div>

          <div className="form-grid-two">
            <label>Ukuran Logo (px)
              <input
                type="number"
                min="30"
                max="180"
                value={form.logo_width}
                onChange={e=>setForm({...form,logo_width:Number(e.target.value)})}
              />
            </label>

            <label>Posisi Logo
              <select
                value={form.logo_align}
                onChange={e=>setForm({...form,logo_align:e.target.value as ReceiptPrintSettings['logo_align']})}
              >
                <option value="left">Kiri</option>
                <option value="center">Tengah</option>
                <option value="right">Kanan</option>
              </select>
              <small className="logo-position-current">Aktif: {form.logo_align==='left'?'Kiri':form.logo_align==='right'?'Kanan':'Tengah'}</small>
            </label>
          </div>

          <label className="print-switch">
            <input type="checkbox" checked={form.show_logo} onChange={e=>setBool('show_logo',e.target.checked)}/>
            <span><b>Tampilkan Logo di Nota</b><small>Berlaku untuk thermal 58/80 mm dan A4/PDF.</small></span>
          </label>
        </section>

        <section className="panel print-settings-card">
          <header><QrCode size={20}/><div><b>Isi Nota</b><small>Centang informasi yang ingin dicetak.</small></div></header>
          <div className="print-option-grid">
            {[
              ['show_logo','Logo'],
              ['show_qr','QR Tracking'],
              
              ['show_customer_phone','Telepon'],
              ['show_due_at','Estimasi Selesai'],
              ['show_payment_method','Metode Pembayaran'],
              ['show_status','Status Cucian'],
              ['show_item_price','Harga per Item'],
              ['show_discount','Diskon'],
              ['show_paid','Sudah Bayar'],
              ['show_balance','Sisa/Piutang'],
              ['show_maps','Link Maps'],
              ['show_cut_line','Garis Potong']
            ].map(([key,label])=><label className="print-check" key={key}>
              <input
                type="checkbox"
                checked={Boolean(form[key as keyof ReceiptPrintSettings])}
                onChange={e=>setBool(key as keyof ReceiptPrintSettings,e.target.checked)}
              />
              <span>{label}</span>
            </label>)}
          </div>
        </section>

        <section className="panel print-settings-card">
          <header><FileText size={20}/><div><b>Header & Footer</b><small>Pesan tambahan khusus nota.</small></div></header>
          <label>Catatan Header
            <textarea rows={3} value={form.header_note} onChange={e=>setForm({...form,header_note:e.target.value})} placeholder="Contoh: Laundry Bersih • Wangi • Tepat Waktu"/>
          </label>
          <label>Catatan Footer
            <textarea rows={4} value={form.footer_note} onChange={e=>setForm({...form,footer_note:e.target.value})} placeholder="Contoh: Komplain maksimal 2x24 jam."/>
          </label>
        </section>

        {message&&<div className="error-box">{message}</div>}
        {success&&<div className="success-box"><CheckCircle2 size={18}/>{success}</div>}
        <div className="print-settings-actions">
          <button className="primary-button" disabled={busy}><Save size={17}/>{busy?'Menyimpan...':'Simpan Pengaturan Print'}</button>
        </div>
      </div>

      <aside className="panel receipt-live-preview">
        <div className="receipt-preview-head">
          <div><Settings2 size={19}/><span><b>Preview Nota</b><small>{form.paper_size==='a4'?'A4':`${form.paper_size} mm`} • {form.template}</small></span></div>
        </div>

        <div className={`receipt-paper receipt-template-${form.template}`} style={{maxWidth:width,fontSize:`${previewFont}px`}}>
          {form.show_logo&&<div className="receipt-preview-logo">
            <img
              src={form.logo_url||'/logo-happylaundry.jpg'}
              alt="Logo"
              style={{
                width:`${Math.min(180,Math.max(30,Number(form.logo_width)||64))}px`,
                display:'block',
                marginLeft:form.logo_align==='right'?'auto':form.logo_align==='center'?'auto':'0',
                marginRight:form.logo_align==='left'?'auto':form.logo_align==='center'?'auto':'0'
              }}
            />
          </div>}
          <h2>HappyLaundry Babakan</h2>
          <p>Jalan Prabu Kiansantang • Babakan Cirebon</p>
          {form.header_note&&<p><b>{form.header_note}</b></p>}
          <hr/>
          <div><span>No. Order</span><b>HL-260808-00001</b></div>
          <div><span>Pelanggan</span><b>Budi</b></div>
          {form.show_customer_phone&&<div><span>Telepon</span><b>0812••••1234</b></div>}
          {form.show_status&&<div><span>Status</span><b>Diterima</b></div>}
          {form.show_due_at&&<div><span>Estimasi</span><b>09/08/2026 16:00</b></div>}
          {form.show_payment_method&&<div><span>Pembayaran</span><b>Tunai</b></div>}
          <hr/>
          <div><span>Cuci Kering Lipat</span><b>2 kg</b></div>
          {form.show_item_price&&<small>2 kg × Rp 8.000 = Rp 16.000</small>}
          <div><span>Bed Cover</span><b>1 item</b></div>
          {form.show_item_price&&<small>1 × Rp 30.000 = Rp 30.000</small>}
          <hr/>
          <div><span>Subtotal</span><b>Rp 46.000</b></div>
          {form.show_discount&&<div><span>Diskon</span><b>Rp 1.000</b></div>}
          <div className="receipt-preview-total"><span>Total</span><b>Rp 45.000</b></div>
          {form.show_paid&&<div><span>Sudah Bayar</span><b>Rp 25.000</b></div>}
          {form.show_balance&&<div><span>Sisa</span><b>Rp 20.000</b></div>}
          {form.show_qr&&<hr/>}
          {form.show_qr&&<div className="receipt-preview-qr">QR<br/><small>Tracking</small></div>}
          {form.show_maps&&<small>Maps: HappyLaundry Babakan</small>}
          <p className="receipt-preview-footer">{form.footer_note||'Terima kasih telah menggunakan HappyLaundry.'}</p>
          {form.show_cut_line&&<div className="receipt-cut-line">✂ - - - - - - - - - - -</div>}
          <small className="receipt-preview-url">{preview.tracking}</small>
        </div>
      </aside>
    </form>
  </>
}
