import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { formatRupiah } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { Service } from '../types/master'

const emptyForm = { name: '', category: 'Kiloan', unit: 'kg' as Service['unit'], price: '0', duration_hours: '24', is_active: true }

export function ServicesPage() {
  const [rows, setRows] = useState<Service[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('v100_services')
      .select('id, store_id, name, category, unit, price, duration_hours, is_active, created_at')
      .order('name')
    if (error) setMessage(error.message)
    else setRows((data as Service[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const keyword = query.toLowerCase().trim()
    return keyword ? rows.filter(row => `${row.name} ${row.category}`.toLowerCase().includes(keyword)) : rows
  }, [query, rows])

  const openCreate = () => { setEditing(null); setForm(emptyForm); setMessage(''); setModalOpen(true) }
  const openEdit = (row: Service) => {
    setEditing(row)
    setForm({ name: row.name, category: row.category, unit: row.unit, price: String(row.price), duration_hours: String(row.duration_hours), is_active: row.is_active })
    setMessage('')
    setModalOpen(true)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      unit: form.unit,
      price: Number(form.price),
      duration_hours: Number(form.duration_hours),
      is_active: form.is_active
    }
    const result = editing
      ? await supabase.from('v100_services').update(payload).eq('id', editing.id)
      : await supabase.from('v100_services').insert(payload)
    if (result.error) setMessage(result.error.message)
    else { setModalOpen(false); await load() }
    setBusy(false)
  }

  const remove = async (row: Service) => {
    if (!window.confirm(`Hapus layanan ${row.name}?`)) return
    const { error } = await supabase.from('v100_services').delete().eq('id', row.id)
    if (error) setMessage(error.message)
    else await load()
  }

  return (
    <>
      <PageHeader eyebrow="MASTER DATA" title="Layanan & Harga" description="Atur jenis layanan, satuan, harga, dan estimasi pengerjaan." action={<button className="primary-button" onClick={openCreate}><Plus size={18} /> Tambah Layanan</button>} />
      <section className="panel data-panel">
        <div className="toolbar"><label className="search-box"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari layanan atau kategori" /></label><span className="record-count">{filtered.length} layanan</span></div>
        {message && <div className="error-box inline-message">{message}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Layanan</th><th>Kategori</th><th>Satuan</th><th>Harga</th><th>Estimasi</th><th>Status</th><th /></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="table-empty">Memuat layanan...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={7} className="table-empty"><Sparkles size={30} />Belum ada layanan.</td></tr>}
              {filtered.map(row => <tr key={row.id}><td><b>{row.name}</b></td><td>{row.category}</td><td>{row.unit}</td><td><b>{formatRupiah(row.price)}</b></td><td>{row.duration_hours} jam</td><td><span className={row.is_active ? 'badge success-badge' : 'badge muted-badge'}>{row.is_active ? 'Aktif' : 'Nonaktif'}</span></td><td><div className="row-actions"><button onClick={() => openEdit(row)}><Pencil size={16} /></button><button className="danger-icon" onClick={() => void remove(row)}><Trash2 size={16} /></button></div></td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
      {modalOpen && <Modal title={editing ? 'Edit Layanan' : 'Tambah Layanan'} onClose={() => setModalOpen(false)}><form className="modal-form" onSubmit={submit}>
        <div className="form-grid-two"><label>Nama layanan<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label><label>Kategori<input value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} required /></label></div>
        <div className="form-grid-two"><label>Satuan<select value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value as Service['unit'] })}><option value="kg">Kilogram</option><option value="pcs">Pcs</option><option value="item">Item</option>
<option value="cm">Centimeter (cm)</option>
</select></label><label>Harga<input type="number" min="0" value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} required /></label></div>
        <label>Estimasi pengerjaan (jam)<input type="number" min="1" value={form.duration_hours} onChange={event => setForm({ ...form, duration_hours: event.target.value })} required /></label>
        <label className="checkbox-label"><input type="checkbox" checked={form.is_active} onChange={event => setForm({ ...form, is_active: event.target.checked })} /> Layanan aktif dan dapat dipilih saat membuat order</label>
        {message && <div className="error-box">{message}</div>}
        <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>Batal</button><button className="primary-button" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</button></div>
      </form></Modal>}
    </>
  )
}
