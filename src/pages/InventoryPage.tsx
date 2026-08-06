import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, History,
  Package, Pencil, Plus, Search, Trash2, WalletCards
} from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { formatRupiah } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { InventoryItem, InventoryMovement, InventoryUnit, Supplier } from '../types/inventory'

const units:InventoryUnit[]=['ml','liter','gram','kg','pcs','roll','box','pack','item']
const emptyItem={name:'',category:'Bahan Cuci',unit:'liter' as InventoryUnit,minimum_stock:'0',cost_price:'0',supplier_id:'',notes:'',is_active:true}
const emptyMovement={item_id:'',movement_type:'in' as 'in'|'out'|'adjustment',quantity:'1',unit_cost:'0',supplier_id:'',reference:'',notes:''}

export function InventoryPage(){
  const [rows,setRows]=useState<InventoryItem[]>([])
  const [movements,setMovements]=useState<InventoryMovement[]>([])
  const [suppliers,setSuppliers]=useState<Supplier[]>([])
  const [query,setQuery]=useState('')
  const [filter,setFilter]=useState<'all'|'low'|'empty'>('all')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [itemModal,setItemModal]=useState(false)
  const [movementModal,setMovementModal]=useState(false)
  const [historyOpen,setHistoryOpen]=useState(false)
  const [editing,setEditing]=useState<InventoryItem|null>(null)
  const [itemForm,setItemForm]=useState(emptyItem)
  const [movementForm,setMovementForm]=useState(emptyMovement)

  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const [items,moves,sups]=await Promise.all([
      supabase.from('v104_inventory_items_view').select('*').order('name'),
      supabase.from('v104_inventory_movements_view').select('*').order('created_at',{ascending:false}).limit(100),
      supabase.from('v104_suppliers').select('*').eq('is_active',true).order('name')
    ])
    const error=items.error||moves.error||sups.error
    if(error)setMessage(error.message)
    else{
      setRows((items.data as InventoryItem[])||[])
      setMovements((moves.data as InventoryMovement[])||[])
      setSuppliers((sups.data as Supplier[])||[])
    }
    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  const filtered=useMemo(()=>{
    const key=query.toLowerCase().trim()
    return rows.filter(row=>{
      if(filter==='low'&&!(Number(row.stock)>0&&Number(row.stock)<=Number(row.minimum_stock)))return false
      if(filter==='empty'&&Number(row.stock)>0)return false
      if(key&&!`${row.name} ${row.category} ${row.supplier_name||''}`.toLowerCase().includes(key))return false
      return true
    })
  },[rows,query,filter])

  const stats=useMemo(()=>{
    const active=rows.filter(r=>r.is_active)
    return{
      total:active.length,
      low:active.filter(r=>Number(r.stock)>0&&Number(r.stock)<=Number(r.minimum_stock)).length,
      empty:active.filter(r=>Number(r.stock)<=0).length,
      value:active.reduce((sum,r)=>sum+Number(r.stock)*Number(r.cost_price),0)
    }
  },[rows])

  const openCreate=()=>{
    setEditing(null);setItemForm(emptyItem);setMessage('');setItemModal(true)
  }

  const openEdit=(row:InventoryItem)=>{
    setEditing(row)
    setItemForm({
      name:row.name,category:row.category,unit:row.unit,
      minimum_stock:String(row.minimum_stock),cost_price:String(row.cost_price),
      supplier_id:row.supplier_id||'',notes:row.notes||'',is_active:row.is_active
    })
    setMessage('');setItemModal(true)
  }

  const saveItem=async(event:FormEvent)=>{
    event.preventDefault();setBusy(true);setMessage('')
    const payload={
      name:itemForm.name.trim(),
      category:itemForm.category.trim()||'Bahan Cuci',
      unit:itemForm.unit,
      minimum_stock:Number(itemForm.minimum_stock||0),
      cost_price:Number(itemForm.cost_price||0),
      supplier_id:itemForm.supplier_id||null,
      notes:itemForm.notes.trim()||null,
      is_active:itemForm.is_active
    }
    const result=editing
      ? await supabase.from('v104_inventory_items').update(payload).eq('id',editing.id)
      : await supabase.from('v104_inventory_items').insert(payload)
    if(result.error)setMessage(result.error.message)
    else{setItemModal(false);await load()}
    setBusy(false)
  }

  const removeItem=async(row:InventoryItem)=>{
    if(!window.confirm(`Hapus bahan ${row.name}? Riwayat stok akan tetap tersimpan.`))return
    const {error}=await supabase.from('v104_inventory_items').update({is_active:false}).eq('id',row.id)
    if(error)setMessage(error.message)
    else await load()
  }

  const openMovement=(row?:InventoryItem,type:'in'|'out'|'adjustment'='in')=>{
    setMovementForm({
      ...emptyMovement,
      item_id:row?.id||'',
      movement_type:type,
      unit_cost:String(row?.cost_price||0),
      supplier_id:row?.supplier_id||''
    })
    setMessage('');setMovementModal(true)
  }

  const saveMovement=async(event:FormEvent)=>{
    event.preventDefault();setBusy(true);setMessage('')
    const qty=Number(movementForm.quantity)
    if(qty<=0){setMessage('Jumlah harus lebih dari 0.');setBusy(false);return}
    const {error}=await supabase.rpc('v104_add_inventory_movement',{
      p_item_id:movementForm.item_id,
      p_movement_type:movementForm.movement_type,
      p_quantity:qty,
      p_unit_cost:Number(movementForm.unit_cost||0),
      p_supplier_id:movementForm.supplier_id||null,
      p_reference:movementForm.reference.trim()||null,
      p_notes:movementForm.notes.trim()||null
    })
    if(error)setMessage(error.message)
    else{setMovementModal(false);await load()}
    setBusy(false)
  }

  return <>
    <PageHeader
      eyebrow="INVENTORY MANAGEMENT"
      title="Stok Bahan"
      description="Pantau stok, minimum persediaan, barang masuk/keluar, dan nilai bahan."
      action={<div className="inventory-header-actions">
        <button className="secondary-button" onClick={()=>setHistoryOpen(true)}><History size={17}/>Riwayat</button>
        <button className="secondary-button" onClick={()=>openMovement(undefined,'in')}><ArrowDownToLine size={17}/>Stok Masuk</button>
        <button className="primary-button" onClick={openCreate}><Plus size={17}/>Tambah Bahan</button>
      </div>}
    />

    <section className="stats-grid inventory-stats">
      <StatCard icon={Boxes} label="Total Bahan" value={String(stats.total)} note="Bahan aktif"/>
      <StatCard icon={AlertTriangle} label="Stok Menipis" value={String(stats.low)} note="Mencapai minimum"/>
      <StatCard icon={Package} label="Stok Habis" value={String(stats.empty)} note="Perlu dibeli"/>
      <StatCard icon={WalletCards} label="Nilai Persediaan" value={formatRupiah(stats.value)} note="Stok × harga modal"/>
    </section>

    <section className="panel data-panel">
      <div className="toolbar inventory-toolbar">
        <label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari bahan, kategori, atau supplier"/></label>
        <select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}>
          <option value="all">Semua stok</option>
          <option value="low">Stok menipis</option>
          <option value="empty">Stok habis</option>
        </select>
        <span className="record-count">{filtered.length} bahan</span>
      </div>

      {message&&<div className="error-box inline-message">{message}</div>}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Bahan</th><th>Kategori</th><th>Stok</th><th>Minimum</th><th>Harga Modal</th><th>Nilai</th><th>Supplier</th><th>Status</th><th/></tr></thead>
          <tbody>
            {loading&&<tr><td colSpan={9} className="table-empty">Memuat stok...</td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={9} className="table-empty"><Package size={30}/>Belum ada bahan.</td></tr>}
            {filtered.map(row=>{
              const stock=Number(row.stock)
              const min=Number(row.minimum_stock)
              const empty=stock<=0
              const low=!empty&&stock<=min
              return <tr key={row.id} className={empty?'inventory-row-empty':low?'inventory-row-low':''}>
                <td><b>{row.name}</b>{row.notes&&<small className="table-sub">{row.notes}</small>}</td>
                <td>{row.category}</td>
                <td><b>{stock.toLocaleString('id-ID')} {row.unit}</b></td>
                <td>{min.toLocaleString('id-ID')} {row.unit}</td>
                <td>{formatRupiah(Number(row.cost_price))}</td>
                <td><b>{formatRupiah(stock*Number(row.cost_price))}</b></td>
                <td>{row.supplier_name||'-'}</td>
                <td><span className={`badge ${empty?'danger-badge':low?'warning-badge':'success-badge'}`}>{empty?'Habis':low?'Menipis':'Aman'}</span></td>
                <td><div className="row-actions inventory-actions">
                  <button title="Stok Masuk" onClick={()=>openMovement(row,'in')}><ArrowDownToLine size={16}/></button>
                  <button title="Stok Keluar" onClick={()=>openMovement(row,'out')}><ArrowUpFromLine size={16}/></button>
                  <button title="Edit" onClick={()=>openEdit(row)}><Pencil size={16}/></button>
                  <button className="danger-icon" title="Nonaktifkan" onClick={()=>void removeItem(row)}><Trash2 size={16}/></button>
                </div></td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
    </section>

    {itemModal&&<Modal title={editing?'Edit Bahan':'Tambah Bahan'} onClose={()=>setItemModal(false)}>
      <form className="modal-form" onSubmit={saveItem}>
        <div className="form-grid-two">
          <label>Nama bahan<input value={itemForm.name} onChange={e=>setItemForm({...itemForm,name:e.target.value})} required/></label>
          <label>Kategori<input value={itemForm.category} onChange={e=>setItemForm({...itemForm,category:e.target.value})} placeholder="Bahan Cuci"/></label>
        </div>
        <div className="form-grid-two">
          <label>Satuan<select value={itemForm.unit} onChange={e=>setItemForm({...itemForm,unit:e.target.value as InventoryUnit})}>{units.map(unit=><option key={unit} value={unit}>{unit}</option>)}</select></label>
          <label>Stok minimum<input type="number" min="0" step="0.01" value={itemForm.minimum_stock} onChange={e=>setItemForm({...itemForm,minimum_stock:e.target.value})}/></label>
        </div>
        <div className="form-grid-two">
          <label>Harga modal per satuan<input type="number" min="0" step="0.01" value={itemForm.cost_price} onChange={e=>setItemForm({...itemForm,cost_price:e.target.value})}/></label>
          <label>Supplier utama<select value={itemForm.supplier_id} onChange={e=>setItemForm({...itemForm,supplier_id:e.target.value})}><option value="">Tanpa supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        </div>
        <label>Catatan<input value={itemForm.notes} onChange={e=>setItemForm({...itemForm,notes:e.target.value})} placeholder="Contoh: deterjen cair utama"/></label>
        <label className="checkbox-label"><input type="checkbox" checked={itemForm.is_active} onChange={e=>setItemForm({...itemForm,is_active:e.target.checked})}/>Bahan aktif</label>
        {message&&<div className="error-box">{message}</div>}
        <div className="form-actions"><button type="button" className="secondary-button" onClick={()=>setItemModal(false)}>Batal</button><button className="primary-button" disabled={busy}>{busy?'Menyimpan...':'Simpan Bahan'}</button></div>
      </form>
    </Modal>}

    {movementModal&&<Modal title="Transaksi Stok" onClose={()=>setMovementModal(false)}>
      <form className="modal-form" onSubmit={saveMovement}>
        <label>Bahan<select value={movementForm.item_id} onChange={e=>{
          const item=rows.find(r=>r.id===e.target.value)
          setMovementForm({...movementForm,item_id:e.target.value,unit_cost:String(item?.cost_price||0),supplier_id:item?.supplier_id||''})
        }} required><option value="">Pilih bahan</option>{rows.filter(r=>r.is_active).map(r=><option key={r.id} value={r.id}>{r.name} — stok {Number(r.stock).toLocaleString('id-ID')} {r.unit}</option>)}</select></label>
        <div className="form-grid-two">
          <label>Jenis<select value={movementForm.movement_type} onChange={e=>setMovementForm({...movementForm,movement_type:e.target.value as typeof movementForm.movement_type})}><option value="in">Barang Masuk</option><option value="out">Barang Keluar</option><option value="adjustment">Penyesuaian (+/-)</option></select></label>
          <label>Jumlah<input type="number" step="0.01" min={movementForm.movement_type==='adjustment'?undefined:'0.01'} value={movementForm.quantity} onChange={e=>setMovementForm({...movementForm,quantity:e.target.value})} required/></label>
        </div>
        <div className="form-grid-two">
          <label>Harga modal/satuan<input type="number" min="0" step="0.01" value={movementForm.unit_cost} onChange={e=>setMovementForm({...movementForm,unit_cost:e.target.value})}/></label>
          <label>Supplier<select value={movementForm.supplier_id} onChange={e=>setMovementForm({...movementForm,supplier_id:e.target.value})}><option value="">Tanpa supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        </div>
        <label>No. referensi / nota<input value={movementForm.reference} onChange={e=>setMovementForm({...movementForm,reference:e.target.value})} placeholder="Contoh: INV-001"/></label>
        <label>Catatan<input value={movementForm.notes} onChange={e=>setMovementForm({...movementForm,notes:e.target.value})} placeholder="Keterangan transaksi stok"/></label>
        {message&&<div className="error-box">{message}</div>}
        <div className="form-actions"><button type="button" className="secondary-button" onClick={()=>setMovementModal(false)}>Batal</button><button className="primary-button" disabled={busy}>{busy?'Menyimpan...':'Simpan Transaksi Stok'}</button></div>
      </form>
    </Modal>}

    {historyOpen&&<Modal title="Riwayat Stok Terbaru" onClose={()=>setHistoryOpen(false)}>
      <div className="inventory-history">
        {movements.length===0&&<div className="table-empty">Belum ada transaksi stok.</div>}
        {movements.map(m=><div className="inventory-history-row" key={m.id}>
          <span className={`inventory-move-icon inventory-move-${m.movement_type}`}>{m.movement_type==='in'?'+':m.movement_type==='out'?'-':'±'}</span>
          <div><b>{m.item_name}</b><small>{new Date(m.created_at).toLocaleString('id-ID')} • {m.reference||'Tanpa referensi'}</small><small>{m.supplier_name||''} {m.notes||''}</small></div>
          <strong>{m.movement_type==='out'?'-':m.movement_type==='in'?'+':''}{Number(m.quantity).toLocaleString('id-ID')}</strong>
        </div>)}
      </div>
    </Modal>}
  </>
}
