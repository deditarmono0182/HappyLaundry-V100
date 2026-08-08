import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2, FileText, Printer, QrCode, Save, Settings2
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

  const load=useCallback(async()=>{
    setLoading(true)
    const{data,error}=await supabase
      .from('v110_receipt_print_settings')
      .select('*')
      .eq('id',1)
      .maybeSingle()
    if(error)setMessage(error.message)
    else if(data)setForm({...defaultReceiptPrintSettings,...data} as ReceiptPrintSettings)
    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  const setBool=(key:keyof ReceiptPrintSettings,value:boolean)=>
    setForm(current=>({...current,[key]:value}))

  const submit=async(event:FormEvent)=>{
    event.preventDefault()
    setBusy(true);setMessage('');setSuccess('')
    const payload={
      ...form,
      id:1,
      font_size:Math.min(18,Math.max(8,Number(form.font_size)||11)),
      copies:Math.min(3,Math.max(1,Number(form.copies)||1)),
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

        <section className="panel print-settings-card">
          <header><QrCode size={20}/><div><b>Isi Nota</b><small>Centang informasi yang ingin dicetak.</small></div></header>
          <div className="print-option-grid">
            {[
              ['show_logo','Logo'],
              ['show_qr','QR Tracking'],
              ['show_barcode','Barcode'],
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
          {form.show_logo&&<img src="/logo-happylaundry.jpg" alt="Logo"/>}
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
          {(form.show_qr||form.show_barcode)&&<hr/>}
          {form.show_qr&&<div className="receipt-preview-qr">QR<br/><small>Tracking</small></div>}
          {form.show_barcode&&<div className="receipt-preview-barcode">|||| ||| || |||| | |||</div>}
          {form.show_maps&&<small>Maps: HappyLaundry Babakan</small>}
          <p className="receipt-preview-footer">{form.footer_note||'Terima kasih telah menggunakan HappyLaundry.'}</p>
          {form.show_cut_line&&<div className="receipt-cut-line">✂ - - - - - - - - - - -</div>}
          <small className="receipt-preview-url">{preview.tracking}</small>
        </div>
      </aside>
    </form>
  </>
}
