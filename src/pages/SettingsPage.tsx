import { FormEvent, useCallback, useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, MapPin, MessageCircle, Save, SlidersHorizontal, Store } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { fillTemplate, openWhatsApp } from '../lib/whatsapp'
import type { StoreSettings } from '../types/settings'

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
  const [form, setForm] = useState<StoreSettings>(defaults)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState('')
  const [density,setDensity]=useState<'comfort'|'compact'|'ultra'>(()=>
    (localStorage.getItem('happylaundry-density') as 'comfort'|'compact'|'ultra')||'compact'
  )

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('v100_store_settings').select('*').eq('id', 1).maybeSingle()
    if (error) setMessage(error.message)
    else if (data) setForm(data as StoreSettings)
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

  const applyDensity=(value:'comfort'|'compact'|'ultra')=>{
    setDensity(value)
    localStorage.setItem('happylaundry-density',value)
    document.documentElement.dataset.density=value
    setSuccess(`Tampilan ${value==='comfort'?'Comfort':value==='compact'?'Compact':'Ultra Compact'} aktif.`)
  }

  const testWhatsApp = () => {
    try {
      const text = fillTemplate(form.whatsapp_order_template, {
        pelanggan: 'Pelanggan Contoh', order: 'HL-TEST-00001', total: 'Rp 50.000',
        estimasi: 'Besok pukul 16.00', usaha: form.business_name
      })
      openWhatsApp(form.phone, text)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'WhatsApp gagal dibuka.')
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

      <section className="panel settings-card settings-wide density-settings-card">
        <header><SlidersHorizontal size={21}/><div><b>Kepadatan Tampilan</b><small>Pilih ukuran baris, kartu, input, dan jarak seluruh aplikasi.</small></div></header>
        <div className="density-options">
          <button type="button" className={density==='comfort'?'active':''} onClick={()=>applyDensity('comfort')}>
            <b>Comfort</b><span>Lebih besar dan lega</span>
          </button>
          <button type="button" className={density==='compact'?'active':''} onClick={()=>applyDensity('compact')}>
            <b>Compact</b><span>Rekomendasi operasional</span>
          </button>
          <button type="button" className={density==='ultra'?'active':''} onClick={()=>applyDensity('ultra')}>
            <b>Ultra Compact</b><span>Maksimal data per layar</span>
          </button>
        </div>
      </section>

      <section className="panel settings-card settings-wide">
        <header><MessageCircle size={21}/><div><b>Template WhatsApp</b><small>Gunakan variabel: {'{{pelanggan}}'}, {'{{order}}'}, {'{{total}}'}, {'{{estimasi}}'}, dan {'{{usaha}}'}.</small></div></header>
        <div className="settings-template-grid">
          <label>Pesan Order Diterima<textarea rows={9} value={form.whatsapp_order_template} onChange={e=>setForm({...form,whatsapp_order_template:e.target.value})}/></label>
          <label>Pesan Siap Diambil<textarea rows={9} value={form.whatsapp_ready_template} onChange={e=>setForm({...form,whatsapp_ready_template:e.target.value})}/></label>
        </div>
        <button type="button" className="secondary-button settings-test" onClick={testWhatsApp}><MessageCircle size={16}/> Uji WhatsApp</button>
      </section>

      {message && <div className="error-box settings-wide">{message}</div>}
      {success && <div className="success-box settings-wide"><CheckCircle2 size={18}/>{success}</div>}
      <div className="settings-actions settings-wide"><button className="primary-button" disabled={busy}><Save size={17}/>{busy?'Menyimpan...':'Simpan Pengaturan'}</button></div>
    </form>
  </>
}
