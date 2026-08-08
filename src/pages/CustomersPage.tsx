import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarPlus, Clock3, Crown, DollarSign, Pencil, Plus, Search, ShoppingBag, Trash2, UserRound, UsersRound } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { formatIDR, normalizePhone } from '../lib/format'
import type { Customer } from '../types/master'

const emptyForm = { name: '', phone: '', address: '', notes: '' }

type CustomerOrder={
  id:string
  customer_id:string
  total:number
  paid_amount:number
  status:string
  created_at:string
}

export function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([])
  const [orders,setOrders]=useState<CustomerOrder[]>([])
  const [segment,setSegment]=useState<'all'|'top'|'new'|'inactive'>('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load=useCallback(async()=>{
    setLoading(true)
    const[c,o]=await Promise.all([
      supabase
        .from('v100_customers')
        .select('id, store_id, name, phone, address, notes, created_at')
        .order('created_at',{ascending:false}),
      supabase
        .from('v100_orders')
        .select('id,customer_id,total,paid_amount,status,created_at')
        .order('created_at',{ascending:false})
    ])

    const error=c.error||o.error
    if(error)setMessage(error.message)
    else{
      setRows((c.data as Customer[])||[])
      setOrders((o.data as CustomerOrder[])||[])
    }
    setLoading(false)
  },[])

  useEffect(() => { void load() }, [load])

  const analytics=useMemo(()=>{
    const validOrders=orders.filter(order=>order.status!=='cancelled')
    const byCustomer=new Map<string,CustomerOrder[]>()

    for(const order of validOrders){
      const list=byCustomer.get(order.customer_id)||[]
      list.push(order)
      byCustomer.set(order.customer_id,list)
    }

    return rows.map(customer=>{
      const list=byCustomer.get(customer.id)||[]
      const transactionCount=list.length
      const totalSpend=list.reduce((sum,order)=>sum+Number(order.total||0),0)
      const paidSpend=list.reduce((sum,order)=>sum+Number(order.paid_amount||0),0)
      const averageTransaction=transactionCount?totalSpend/transactionCount:0
      const lastTransaction=list.length
        ? list.reduce((latest,order)=>new Date(order.created_at)>new Date(latest)?order.created_at:latest,list[0].created_at)
        : null

      return{
        customer,
        transactionCount,
        totalSpend,
        paidSpend,
        averageTransaction,
        lastTransaction
      }
    })
  },[rows,orders])

  const now=new Date()
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1)
  const inactiveCutoff=new Date(now)
  inactiveCutoff.setDate(inactiveCutoff.getDate()-60)

  const topCustomers=useMemo(()=>analytics
    .filter(row=>row.transactionCount>0)
    .sort((a,b)=>b.transactionCount-a.transactionCount||b.totalSpend-a.totalSpend)
    .slice(0,10)
  ,[analytics])

  const topIds=useMemo(()=>new Set(topCustomers.map(row=>row.customer.id)),[topCustomers])

  const newCustomers=useMemo(()=>analytics.filter(row=>
    new Date(row.customer.created_at)>=monthStart
  ),[analytics])

  const inactiveCustomers=useMemo(()=>analytics.filter(row=>
    row.transactionCount>0&&
    row.lastTransaction&&
    new Date(row.lastTransaction)<inactiveCutoff
  ).sort((a,b)=>
    new Date(a.lastTransaction!).getTime()-new Date(b.lastTransaction!).getTime()
  ),[analytics])

  const filtered=useMemo(()=>{
    const keyword=query.toLowerCase().trim()

    return analytics.filter(row=>{
      if(segment==='top'&&!topIds.has(row.customer.id))return false
      if(segment==='new'&&new Date(row.customer.created_at)<monthStart)return false
      if(segment==='inactive'&&!(
        row.transactionCount>0&&
        row.lastTransaction&&
        new Date(row.lastTransaction)<inactiveCutoff
      ))return false

      if(!keyword)return true
      return `${row.customer.name} ${row.customer.phone} ${row.customer.address||''}`
        .toLowerCase()
        .includes(keyword)
    })
  },[analytics,query,segment,topIds])

  const totalTransactions=analytics.reduce((sum,row)=>sum+row.transactionCount,0)
  const totalCustomerSpend=analytics.reduce((sum,row)=>sum+row.totalSpend,0)
  const bestCustomer=topCustomers[0]||null


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
        action={<button className="primary-button" onClick={openCreate}><Plus size={18} /> Tambah Pelanggan</button>}
      />

      <section className="stats-grid customer-analytics-stats">
        <article className="stat-card">
          <div className="stat-icon"><UsersRound size={22}/></div>
          <div><span>Total Pelanggan</span><strong>{rows.length}</strong><small>Seluruh pelanggan tersimpan</small></div>
        </article>
        <article className="stat-card">
          <div className="stat-icon"><ShoppingBag size={22}/></div>
          <div><span>Total Transaksi</span><strong>{totalTransactions}</strong><small>Order tidak dibatalkan</small></div>
        </article>
        <article className="stat-card">
          <div className="stat-icon"><CalendarPlus size={22}/></div>
          <div><span>Pelanggan Baru Bulan Ini</span><strong>{newCustomers.length}</strong><small>Terdaftar sejak awal bulan</small></div>
        </article>
        <article className="stat-card">
          <div className="stat-icon"><Clock3 size={22}/></div>
          <div><span>Tidak Kembali 60+ Hari</span><strong>{inactiveCustomers.length}</strong><small>Pernah transaksi, lalu tidak kembali</small></div>
        </article>
      </section>

      <section className="customer-analytics-grid">
        <article className="panel customer-best-card">
          <div className="customer-best-icon"><Crown size={26}/></div>
          <div>
            <span>PELANGGAN PALING AKTIF</span>
            <h3>{bestCustomer?.customer.name||'Belum ada transaksi'}</h3>
            <p>{bestCustomer
              ? `${bestCustomer.transactionCount} transaksi • Total ${formatIDR(bestCustomer.totalSpend)}`
              : 'Data akan muncul setelah ada transaksi pelanggan.'}</p>
          </div>
          {bestCustomer&&<div className="customer-best-average">
            <span>Rata-rata transaksi</span>
            <b>{formatIDR(bestCustomer.averageTransaction)}</b>
          </div>}
        </article>

        <article className="panel customer-value-card">
          <DollarSign size={22}/>
          <div>
            <span>Total Nilai Transaksi Pelanggan</span>
            <b>{formatIDR(totalCustomerSpend)}</b>
            <small>Akumulasi nilai order, tidak termasuk order dibatalkan.</small>
          </div>
        </article>
      </section>

      <section className="panel customer-segment-toolbar">
        <div>
          <b>Analitik Pelanggan</b>
          <small>Pilih kelompok pelanggan yang ingin ditampilkan.</small>
        </div>
        <div className="customer-segment-tabs">
          <button className={segment==='all'?'active':''} onClick={()=>setSegment('all')}>Semua</button>
          <button className={segment==='top'?'active':''} onClick={()=>setSegment('top')}>Top 10</button>
          <button className={segment==='new'?'active':''} onClick={()=>setSegment('new')}>Baru Bulan Ini</button>
          <button className={segment==='inactive'?'active':''} onClick={()=>setSegment('inactive')}>Tidak Kembali 60+ Hari</button>
        </div>
      </section>

      <section className="panel data-panel">
        <div className="toolbar">
          <label className="search-box"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nama, telepon, atau alamat" /></label>
          <span className="record-count">{filtered.length} pelanggan</span>
        </div>
        {message && <div className="error-box inline-message">{message}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Pelanggan</th><th>WhatsApp</th><th>Transaksi</th><th>Total Belanja</th><th>Rata-rata</th><th>Terakhir Transaksi</th><th>Dibuat</th><th /></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="table-empty">Memuat pelanggan...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={8} className="table-empty"><UserRound size={30} />Belum ada pelanggan.</td></tr>}
              {filtered.map(row => (
                <tr key={row.customer.id}>
                  <td>
                    <b>{row.customer.name}</b>
                    <small>{row.customer.address||'-'}</small>
                    {row.customer.notes&&<small>{row.customer.notes}</small>}
                  </td>
                  <td>{row.customer.phone}</td>
                  <td>
                    <b>{row.transactionCount}</b>
                    {topIds.has(row.customer.id)&&row.transactionCount>0&&<small className="customer-top-label">Top Customer</small>}
                  </td>
                  <td><b>{formatIDR(row.totalSpend)}</b><small>Dibayar {formatIDR(row.paidSpend)}</small></td>
                  <td>{formatIDR(row.averageTransaction)}</td>
                  <td>
                    {row.lastTransaction
                      ? <><b>{new Date(row.lastTransaction).toLocaleDateString('id-ID')}</b><small>{Math.floor((Date.now()-new Date(row.lastTransaction).getTime())/86400000)} hari lalu</small></>
                      : <span className="customer-never-order">Belum transaksi</span>}
                  </td>
                  <td>{new Date(row.customer.created_at).toLocaleDateString('id-ID')}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => openEdit(row.customer)} aria-label="Edit"><Pencil size={16}/></button>
                      <button className="danger-icon" onClick={() => void remove(row.customer)} aria-label="Hapus"><Trash2 size={16}/></button>
                    </div>
                  </td>
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
