import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2, UserRound } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { normalizePhone } from '../lib/format'
import type { Customer } from '../types/master'

const emptyForm = { name: '', phone: '', address: '', notes: '' }

export function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('v100_customers')
      .select('id, store_id, name, phone, address, notes, created_at')
      .order('created_at', { ascending: false })
    if (error) setMessage(error.message)
    else setRows((data as Customer[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const keyword = query.toLowerCase().trim()
    if (!keyword) return rows
    return rows.filter(row => `${row.name} ${row.phone} ${row.address || ''}`.toLowerCase().includes(keyword))
  }, [query, rows])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setMessage('')
    setModalOpen(true)
  }

  const openEdit = (row: Customer) => {
    setEditing(row)
    setForm({ name: row.name, phone: row.phone, address: row.address || '', notes: row.notes || '' })
    setMessage('')
    setModalOpen(true)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    const payload = {
      name: form.name.trim(),
      phone: normalizePhone(form.phone),
      address: form.address.trim() || null,
      notes: form.notes.trim() || null
    }
    const result = editing
      ? await supabase.from('v100_customers').update(payload).eq('id', editing.id)
      : await supabase.from('v100_customers').insert(payload)
    if (result.error) setMessage(result.error.message)
    else {
      setModalOpen(false)
      await load()
    }
    setBusy(false)
  }

  const remove = async (row: Customer) => {
    if (!window.confirm(`Hapus pelanggan ${row.name}?`)) return
    const { error } = await supabase.from('v100_customers').delete().eq('id', row.id)
    if (error) setMessage(error.message)
    else await load()
  }

  return (
    <>
      <PageHeader
        eyebrow="MASTER DATA"
        title="Pelanggan"
        description="Simpan kontak pelanggan agar pembuatan order lebih cepat."
        action={<button className="primary-button customer-add-button" onClick={openCreate}><Plus size={18} /> Tambah Pelanggan</button>}
      />

      <section className="panel data-panel">
        <div className="toolbar">
          <label className="search-box"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nama, telepon, atau alamat" /></label>
          <span className="record-count">{filtered.length} pelanggan</span>
        </div>
        {message && <div className="error-box inline-message">{message}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Pelanggan</th><th>WhatsApp</th><th>Alamat</th><th>Dibuat</th><th /></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="table-empty">Memuat pelanggan...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={5} className="table-empty"><UserRound size={30} />Belum ada pelanggan.</td></tr>}
              {filtered.map(row => (
                <tr key={row.id}>
                  <td><b>{row.name}</b>{row.notes && <small>{row.notes}</small>}</td>
                  <td>{row.phone}</td>
                  <td>{row.address || '-'}</td>
                  <td>{new Date(row.created_at).toLocaleDateString('id-ID')}</td>
                  <td><div className="row-actions"><button onClick={() => openEdit(row)} aria-label="Edit"><Pencil size={16} /></button><button className="danger-icon" onClick={() => void remove(row)} aria-label="Hapus"><Trash2 size={16} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal title={editing ? 'Edit Pelanggan' : 'Tambah Pelanggan'} onClose={() => setModalOpen(false)}>
          <form className="modal-form" onSubmit={submit}>
            <label>Nama pelanggan<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label>
            <label>Nomor WhatsApp<input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} inputMode="tel" required /></label>
            <label>Alamat<textarea value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} rows={3} /></label>
            <label>Catatan<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} rows={2} /></label>
            {message && <div className="error-box">{message}</div>}
            <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>Batal</button><button className="primary-button" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</button></div>
          </form>
        </Modal>
      )}
    </>
  )
}
