import { FormEvent, useCallback, useEffect, useState } from 'react'
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'

interface EmployeeRow{
  id:string
  full_name:string
  email:string
  phone:string|null
  is_active:boolean
  dashboard:boolean
  cashier:boolean
  orders:boolean
  qr_center:boolean
  production:boolean
  customers:boolean
  services:boolean
  created_at:string
}

const permissionOptions=[
  ['dashboard','Dashboard'],
  ['cashier','Kasir'],
  ['orders','Order'],
  ['qr_center','QR Center'],
  ['production','Produksi'],
  ['customers','Pelanggan'],
  ['services','Layanan']
] as const

const emptyForm={
  full_name:'',email:'',phone:'',is_active:true,
  dashboard:true,cashier:true,orders:true,qr_center:true,
  production:false,customers:true,services:true
}

export function EmployeesPage(){
  const[rows,setRows]=useState<EmployeeRow[]>([])
  const[open,setOpen]=useState(false)
  const[editing,setEditing]=useState<EmployeeRow|null>(null)
  const[form,setForm]=useState(emptyForm)
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const[success,setSuccess]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const{data,error}=await supabase
      .from('v107_employee_access')
      .select('*')
      .order('full_name')
    if(error)setMessage(error.message)
    else setRows((data as EmployeeRow[])||[])
    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  const create=()=>{
    setEditing(null);setForm(emptyForm);setMessage('');setSuccess('');setOpen(true)
  }

  const edit=(row:EmployeeRow)=>{
    setEditing(row)
    setForm({
      full_name:row.full_name,email:row.email,phone:row.phone||'',
      is_active:row.is_active,dashboard:row.dashboard,cashier:row.cashier,
      orders:row.orders,qr_center:row.qr_center,production:row.production,
      customers:row.customers,services:row.services
    })
    setMessage('');setSuccess('');setOpen(true)
  }

  const save=async(event:FormEvent)=>{
    event.preventDefault();setBusy(true);setMessage('')
    const payload={
      full_name:form.full_name.trim(),
      email:form.email.trim().toLowerCase(),
      phone:form.phone.trim()||null,
      is_active:form.is_active,
      dashboard:form.dashboard,cashier:form.cashier,orders:form.orders,
      qr_center:form.qr_center,production:form.production,
      customers:form.customers,services:form.services,
      updated_at:new Date().toISOString()
    }
    const result=editing
      ? await supabase.from('v107_employee_access').update(payload).eq('id',editing.id)
      : await supabase.from('v107_employee_access').insert(payload)

    if(result.error)setMessage(result.error.message)
    else{
      setOpen(false)
      setSuccess('Data karyawan dan hak akses berhasil disimpan.')
      await load()
    }
    setBusy(false)
  }

  const remove=async(row:EmployeeRow)=>{
    if(!window.confirm(`Nonaktifkan karyawan ${row.full_name}?`))return
    const{error}=await supabase.from('v107_employee_access').update({is_active:false,updated_at:new Date().toISOString()}).eq('id',row.id)
    if(error)setMessage(error.message)
    else await load()
  }

  return <>
    <PageHeader
      eyebrow="EMPLOYEE ACCESS CONTROL"
      title="Karyawan & Hak Akses"
      description="Owner menentukan menu yang boleh digunakan oleh masing-masing karyawan."
      action={<button className="primary-button" onClick={create}><Plus size={17}/>Tambah Karyawan</button>}
    />

    <section className="panel employee-auth-note">
      <KeyRound size={22}/>
      <div>
        <b>Login karyawan menggunakan Supabase Authentication</b>
        <span>Tambahkan email yang sama di Supabase → Authentication → Users. Password tidak disimpan di tabel HappyLaundry.</span>
      </div>
    </section>

    {message&&<div className="error-box inline-message">{message}</div>}
    {success&&<div className="success-box inline-message">{success}</div>}

    <section className="panel data-panel">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Karyawan</th><th>Email/Login</th><th>Status</th>
              <th>Dashboard</th><th>Kasir</th><th>Order</th><th>QR</th>
              <th>Produksi</th><th>Pelanggan</th><th>Layanan</th><th/>
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={11} className="table-empty">Memuat karyawan...</td></tr>}
            {!loading&&rows.length===0&&<tr><td colSpan={11} className="table-empty">Belum ada karyawan.</td></tr>}
            {rows.map(row=><tr key={row.id}>
              <td><b>{row.full_name}</b>{row.phone&&<small>{row.phone}</small>}</td>
              <td>{row.email}</td>
              <td><span className={`badge ${row.is_active?'success-badge':'danger-badge'}`}>{row.is_active?'Aktif':'Nonaktif'}</span></td>
              {permissionOptions.map(([key])=><td key={key}><span className={`permission-dot ${row[key]?'on':'off'}`}>{row[key]?'✓':'—'}</span></td>)}
              <td><div className="row-actions"><button title="Edit" onClick={()=>edit(row)}><Pencil size={16}/></button><button className="danger-icon" title="Nonaktifkan" onClick={()=>void remove(row)}><Trash2 size={16}/></button></div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {open&&<Modal title={editing?'Edit Karyawan':'Tambah Karyawan'} onClose={()=>setOpen(false)}>
      <form className="modal-form" onSubmit={save}>
        <div className="employee-form-head"><UserRound size={22}/><div><b>Data Login Karyawan</b><span>Email harus sama dengan akun di Supabase Authentication.</span></div></div>
        <div className="form-grid-two">
          <label>Nama Karyawan<input value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} required/></label>
          <label>Email Login<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required/></label>
        </div>
        <label>No. WhatsApp<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="08..."/></label>

        <div className="employee-permission-box">
          <header><ShieldCheck size={19}/><div><b>Hak Akses Menu</b><small>Centang hanya menu yang dibutuhkan karyawan.</small></div></header>
          <div className="employee-permission-grid">
            {permissionOptions.map(([key,label])=><label className="permission-check" key={key}>
              <input type="checkbox" checked={form[key]} onChange={e=>setForm({...form,[key]:e.target.checked})}/>
              <span>{label}</span>
            </label>)}
          </div>
        </div>

        <label className="checkbox-label"><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/>Karyawan aktif</label>

        {message&&<div className="error-box">{message}</div>}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={()=>setOpen(false)}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy?'Menyimpan...':'Simpan Karyawan'}</button>
        </div>
      </form>
    </Modal>}
  </>
}
