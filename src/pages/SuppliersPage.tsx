import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Search, Truck, Trash2 } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import type { Supplier } from '../types/inventory'

const emptyForm={name:'',phone:'',contact_person:'',address:'',notes:'',is_active:true}

export function SuppliersPage(){
  const [rows,setRows]=useState<Supplier[]>([])
  const [query,setQuery]=useState('')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [open,setOpen]=useState(false)
  const [editing,setEditing]=useState<Supplier|null>(null)
  const [form,setForm]=useState(emptyForm)

  const load=useCallback(async()=>{
    setLoading(true)
    const {data,error}=await supabase.from('v104_suppliers').select('*').order('name')
    if(error)setMessage(error.message)
    else setRows((data as Supplier[])||[])
    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  const filtered=useMemo(()=>{
    const key=query.toLowerCase().trim()
    return key?rows.filter(r=>`${r.name} ${r.phone||''} ${r.contact_person||''}`.toLowerCase().includes(key)):rows
  },[rows,query])

  const openCreate=()=>{setEditing(null);setForm(emptyForm);setMessage('');setOpen(true)}
  const openEdit=(row:Supplier)=>{
    setEditing(row);setForm({name:row.name,phone:row.phone||'',contact_person:row.contact_person||'',address:row.address||'',notes:row.notes||'',is_active:row.is_active});setMessage('');setOpen(true)
  }

  const save=async(event:FormEvent)=>{
    event.preventDefault();setBusy(true);setMessage('')
    const payload={name:form.name.trim(),phone:form.phone.trim()||null,contact_person:form.contact_person.trim()||null,address:form.address.trim()||null,notes:form.notes.trim()||null,is_active:form.is_active}
    const result=editing?await supabase.from('v104_suppliers').update(payload).eq('id',editing.id):await supabase.from('v104_suppliers').insert(payload)
    if(result.error)setMessage(result.error.message)
    else{setOpen(false);await load()}
    setBusy(false)
  }

  const remove=async(row:Supplier)=>{
    if(!window.confirm(`Nonaktifkan supplier ${row.name}?`))return
    const {error}=await supabase.from('v104_suppliers').update({is_active:false}).eq('id',row.id)
    if(error)setMessage(error.message)
    else await load()
  }

  return <>
    <PageHeader eyebrow="INVENTORY MANAGEMENT" title="Supplier" description="Kelola supplier bahan, kontak, dan alamat pembelian." action={<button className="primary-button" onClick={openCreate}><Plus size={17}/>Tambah Supplier</button>}/>
    <section className="panel data-panel">
      <div className="toolbar"><label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari supplier atau kontak"/></label><span className="record-count">{filtered.length} supplier</span></div>
      {message&&<div className="error-box inline-message">{message}</div>}
      <div className="table-wrap"><table>
        <thead><tr><th>Supplier</th><th>Kontak</th><th>Telepon/WA</th><th>Alamat</th><th>Status</th><th/></tr></thead>
        <tbody>
          {loading&&<tr><td colSpan={6} className="table-empty">Memuat supplier...</td></tr>}
          {!loading&&filtered.length===0&&<tr><td colSpan={6} className="table-empty"><Truck size={30}/>Belum ada supplier.</td></tr>}
          {filtered.map(row=><tr key={row.id}><td><b>{row.name}</b>{row.notes&&<small className="table-sub">{row.notes}</small>}</td><td>{row.contact_person||'-'}</td><td>{row.phone||'-'}</td><td>{row.address||'-'}</td><td><span className={`badge ${row.is_active?'success-badge':'muted-badge'}`}>{row.is_active?'Aktif':'Nonaktif'}</span></td><td><div className="row-actions"><button onClick={()=>openEdit(row)}><Pencil size={16}/></button><button className="danger-icon" onClick={()=>void remove(row)}><Trash2 size={16}/></button></div></td></tr>)}
        </tbody>
      </table></div>
    </section>

    {open&&<Modal title={editing?'Edit Supplier':'Tambah Supplier'} onClose={()=>setOpen(false)}><form className="modal-form" onSubmit={save}>
      <div className="form-grid-two"><label>Nama supplier<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></label><label>Kontak person<input value={form.contact_person} onChange={e=>setForm({...form,contact_person:e.target.value})}/></label></div>
      <label>Telepon / WhatsApp<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
      <label>Alamat<textarea value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label>
      <label>Catatan<input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
      <label className="checkbox-label"><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/>Supplier aktif</label>
      {message&&<div className="error-box">{message}</div>}
      <div className="form-actions"><button type="button" className="secondary-button" onClick={()=>setOpen(false)}>Batal</button><button className="primary-button" disabled={busy}>{busy?'Menyimpan...':'Simpan Supplier'}</button></div>
    </form></Modal>}
  </>
}
