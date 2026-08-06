import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Eye,
  PackageCheck,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Trash2
} from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { formatRupiah } from '../lib/format'
import { paymentLabels, paymentStatus, statusLabels } from '../lib/order'
import { supabase } from '../lib/supabase'
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

export function OrdersPage() {
  const [rows, setRows] = useState<OrderRow[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [detail, setDetail] = useState<OrderRow | null>(null)
  const [form, setForm] = useState(emptyOrder)
  const [items, setItems] = useState<OrderItemDraft[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setMessage('')
    const [ordersResult, customersResult, servicesResult] = await Promise.all([
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
        .order('name')
    ])

    const error = ordersResult.error || customersResult.error || servicesResult.error
    if (error) setMessage(error.message)
    else {
      setRows((ordersResult.data as OrderRow[]) || [])
      setCustomers((customersResult.data as Customer[]) || [])
      setServices((servicesResult.data as Service[]) || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return rows
    return rows.filter(row =>
      `${row.order_no} ${row.customer_name} ${row.customer_phone} ${statusLabels[row.status]}`
        .toLowerCase()
        .includes(keyword)
    )
  }, [query, rows])

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.subtotal, 0),
    [items]
  )
  const total = Math.max(0, subtotal - Number(form.discount || 0))

  const openCreate = () => {
    setForm(emptyOrder)
    setItems([])
    setMessage('')
    setModalOpen(true)
  }

  const addItem = () => {
    const first = services[0]
    if (!first) {
      setMessage('Belum ada layanan aktif. Tambahkan layanan terlebih dahulu.')
      return
    }
    setItems(current => [
      ...current,
      {
        key: crypto.randomUUID(),
        service_id: first.id,
        service_name: first.name,
        unit: first.unit,
        price: Number(first.price),
        quantity: 1,
        subtotal: Number(first.price)
      }
    ])
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

  const changeQuantity = (key: string, quantity: number) => {
    const safeQuantity = Math.max(0.1, quantity || 0.1)
    setItems(current => current.map(item =>
      item.key === key
        ? { ...item, quantity: safeQuantity, subtotal: item.price * safeQuantity }
        : item
    ))
  }

  const removeItem = (key: string) => {
    setItems(current => current.filter(item => item.key !== key))
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

  const advanceStatus = async (row: OrderRow) => {
    const index = statusFlow.indexOf(row.status)
    if (index < 0 || index >= statusFlow.length - 1) return
    const next = statusFlow[index + 1]
    const { error } = await supabase
      .from('v100_orders')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) setMessage(error.message)
    else await load()
  }

  const printReceipt = (row: OrderRow) => {
    const printWindow = window.open('', '_blank', 'width=420,height=700')
    if (!printWindow) return
    printWindow.document.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${row.order_no}</title>
        <style>
          body{font-family:Arial,sans-serif;width:58mm;margin:0 auto;padding:4mm;color:#111}
          h2,p{margin:0 0 5px;text-align:center}.line{border-top:1px dashed #111;margin:8px 0}
          .row{display:flex;justify-content:space-between;font-size:12px;margin:4px 0}
          .strong{font-weight:700}.small{font-size:11px}
        </style>
      </head>
      <body>
        <h2>HappyLaundry</h2>
        <p class="small">Babakan, Cirebon</p>
        <div class="line"></div>
        <div class="row"><span>No. Order</span><b>${row.order_no}</b></div>
        <div class="row"><span>Pelanggan</span><b>${row.customer_name}</b></div>
        <div class="row"><span>WhatsApp</span><span>${row.customer_phone}</span></div>
        <div class="row"><span>Status</span><span>${statusLabels[row.status]}</span></div>
        <div class="line"></div>
        <div class="row"><span>Subtotal</span><span>${formatRupiah(row.subtotal)}</span></div>
        <div class="row"><span>Diskon</span><span>${formatRupiah(row.discount)}</span></div>
        <div class="row strong"><span>Total</span><span>${formatRupiah(row.total)}</span></div>
        <div class="row"><span>Sudah Bayar</span><span>${formatRupiah(row.paid_amount)}</span></div>
        <div class="row"><span>Sisa</span><span>${formatRupiah(row.total-row.paid_amount)}</span></div>
        <div class="line"></div>
        <p class="small">Terima kasih telah menggunakan HappyLaundry.</p>
        <script>window.onload=()=>window.print()</script>
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
          <button className="primary-button" onClick={openCreate}>
            <Plus size={18} /> Order Baru
          </button>
        }
      />

      <section className="stats-grid compact-stats">
        <article className="stat-card"><div className="stat-icon"><ShoppingBag size={22}/></div><div><span>Total Order</span><strong>{rows.length}</strong><small>Seluruh order</small></div></article>
        <article className="stat-card"><div className="stat-icon"><PackageCheck size={22}/></div><div><span>Siap Diambil</span><strong>{rows.filter(r => r.status === 'ready').length}</strong><small>Menunggu pelanggan</small></div></article>
        <article className="stat-card"><div className="stat-icon"><CircleDollarSign size={22}/></div><div><span>Piutang</span><strong>{formatRupiah(rows.reduce((s,r)=>s+Math.max(0,Number(r.total)-Number(r.paid_amount)),0))}</strong><small>Sisa pembayaran</small></div></article>
      </section>

      <section className="panel data-panel order-panel">
        <div className="toolbar">
          <label className="search-box">
            <Search size={18}/>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nomor order, pelanggan, telepon, atau status" />
          </label>
          <span className="record-count">{filtered.length} order</span>
        </div>

        {message && <div className="error-box inline-message">{message}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Pelanggan</th>
                <th>Status</th>
                <th>Pembayaran</th>
                <th>Total</th>
                <th>Dibuat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="table-empty">Memuat order...</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="table-empty"><ShoppingBag size={30}/>Belum ada order.</td></tr>
              )}
              {filtered.map(row => (
                <tr key={row.id}>
                  <td><b>{row.order_no}</b>{row.due_at && <small>Selesai: {new Date(row.due_at).toLocaleString('id-ID')}</small>}</td>
                  <td><b>{row.customer_name}</b><small>{row.customer_phone}</small></td>
                  <td><span className={`badge status-${row.status}`}>{statusLabels[row.status]}</span></td>
                  <td><span className={`badge payment-${row.payment_status}`}>{paymentLabels[row.payment_status]}</span><small>{formatRupiah(row.paid_amount)} / {formatRupiah(row.total)}</small></td>
                  <td><b>{formatRupiah(row.total)}</b></td>
                  <td>{new Date(row.created_at).toLocaleDateString('id-ID')}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => setDetail(row)} aria-label="Detail"><Eye size={16}/></button>
                      <button onClick={() => printReceipt(row)} aria-label="Cetak"><Printer size={16}/></button>
                      {statusFlow.indexOf(row.status) >= 0 && statusFlow.indexOf(row.status) < statusFlow.length - 1 && (
                        <button className="advance-button" onClick={() => void advanceStatus(row)} aria-label="Status berikutnya"><ChevronRight size={16}/></button>
                      )}
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
                    <input type="number" min="0.1" step="0.1" value={item.quantity} onChange={event => changeQuantity(item.key, Number(event.target.value))}/>
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

      {detail && (
        <Modal title={`Detail ${detail.order_no}`} onClose={() => setDetail(null)}>
          <div className="order-detail">
            <div><span>Pelanggan</span><b>{detail.customer_name}</b></div>
            <div><span>WhatsApp</span><b>{detail.customer_phone}</b></div>
            <div><span>Status Cucian</span><b>{statusLabels[detail.status]}</b></div>
            <div><span>Status Pembayaran</span><b>{paymentLabels[detail.payment_status]}</b></div>
            <div><span>Total</span><b>{formatRupiah(detail.total)}</b></div>
            <div><span>Sudah Bayar</span><b>{formatRupiah(detail.paid_amount)}</b></div>
            <div><span>Sisa</span><b>{formatRupiah(detail.total-detail.paid_amount)}</b></div>
            <div><span>Catatan</span><b>{detail.notes || '-'}</b></div>
            <div className="form-actions">
              <button className="secondary-button" onClick={() => printReceipt(detail)}><Printer size={16}/> Cetak Nota</button>
              <button className="primary-button" onClick={() => setDetail(null)}><CheckCircle2 size={16}/> Tutup</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
