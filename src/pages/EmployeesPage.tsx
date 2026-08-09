import { FormEvent, useCallback, useEffect, useState } from 'react'
import {
  Eye, EyeOff, KeyRound, Pencil, Plus, RefreshCw,
  ShieldCheck, Trash2, UserRound, WandSparkles
} from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'

interface EmployeeRow{
  id:string
  full_name:string
  login_id:string
  phone:string|null
  is_active:boolean
  dashboard:boolean
  cashier:boolean
  orders:boolean
  qr_center:boolean
  production:boolean
  customers:boolean
  services:boolean
  payments:boolean
  receivables:boolean
  finance:boolean
  cash:boolean
  reports:boolean
  backup:boolean
  settings:boolean
  failed_login_count:number
  locked_until:string|null
  last_login_at:string|null
  created_at:string
}

const permissionOptions=[
  ['dashboard','Dashboard'],
  ['cashier','Kasir'],
  ['orders','Order'],
  ['qr_center','QR Center'],
  ['production','Produksi'],
  ['customers','Pelanggan'],
  ['services','Layanan'],
  ['payments','Pembayaran'],
  ['receivables','Piutang'],
  ['finance','Keuangan / Input Pengeluaran'],
  ['cash','Kas Harian'],
  ['reports','Laporan'],
  ['backup','Backup'],
  ['settings','Pengaturan']
] as const

const emptyForm={
  full_name:'',login_id:'',phone:'',is_active:true,
  dashboard:true,cashier:true,orders:true,qr_center:true,
  production:false,customers:true,services:true,
  payments:true,receivables:false,finance:false,cash:false,reports:false,backup:false,settings:false,
  password:'',confirm_password:''
}

function generatePassword(){
  const upper='ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower='abcdefghijkmnopqrstuvwxyz'
  const digits='23456789'
  const symbols='!@#$%&*'
  const all=upper+lower+digits+symbols
  const pick=(chars:string)=>chars[Math.floor(Math.random()*chars.length)]
  const chars=[pick(upper),pick(lower),pick(digits),pick(symbols)]
  while(chars.length<12)chars.push(pick(all))
  return chars.sort(()=>Math.random()-.5).join('')
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
  const[showPassword,setShowPassword]=useState(false)
  const[resetEmployee,setResetEmployee]=useState<EmployeeRow|null>(null)
  const[resetPassword,setResetPassword]=useState('')
  const[resetConfirm,setResetConfirm]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const{data,error}=await supabase
      .from('v109_users')
      .select('*')
      .order('full_name')
    if(error)setMessage(error.message)
    else setRows((data as EmployeeRow[])||[])
    setLoading(false)
  },[])

  useEffect(()=>{void load()},[load])

  const create=()=>{
    const password=generatePassword()
    setEditing(null)
    setForm({...emptyForm,password,confirm_password:password})
    setShowPassword(false);setMessage('');setSuccess('');setOpen(true)
  }

  const edit=(row:EmployeeRow)=>{
    setEditing(row)
    setForm({
      full_name:row.full_name,login_id:row.login_id,phone:row.phone||'',
      is_active:row.is_active,dashboard:row.dashboard,cashier:row.cashier,
      orders:row.orders,qr_center:row.qr_center,production:row.production,
      customers:row.customers,services:row.services,payments:row.payments,
      receivables:row.receivables,finance:row.finance,cash:row.cash,
      reports:row.reports,backup:row.backup,settings:row.settings,
      password:'',confirm_password:''
    })
    setMessage('');setSuccess('');setOpen(true)
  }

  const permissionPayload=(source:typeof form)=>({
    p_dashboard:source.dashboard,p_cashier:source.cashier,p_orders:source.orders,
    p_qr_center:source.qr_center,p_production:source.production,p_customers:source.customers,
    p_services:source.services,p_payments:source.payments,p_receivables:source.receivables,
    p_finance:source.finance,p_cash:source.cash,p_reports:source.reports,
    p_backup:source.backup,p_settings:source.settings
  })

  const save=async(event:FormEvent)=>{
    event.preventDefault();setBusy(true);setMessage('');setSuccess('')
    try{
      const loginId=form.login_id.trim().toUpperCase().replace(/[^A-Z0-9._-]/g,'')
      if(loginId.length<3)throw new Error('ID Akun minimal 3 karakter.')

      const common={
        p_full_name:form.full_name.trim(),
        p_login_id:loginId,
        p_phone:form.phone.trim()||null,
        p_is_active:form.is_active,
        ...permissionPayload(form)
      }

      if(editing){
        const{error}=await supabase.rpc('v109_update_employee',{p_id:editing.id,...common})
        if(error)throw error
        setSuccess('Data karyawan dan hak akses berhasil diperbarui.')
      }else{
        if(form.password.length<8)throw new Error('Password minimal 8 karakter.')
        if(form.password!==form.confirm_password)throw new Error('Konfirmasi password tidak sama.')

        const{error}=await supabase.rpc('v109_create_employee',{...common,p_password:form.password})
        if(error)throw error
        setSuccess(`Akun ${loginId} berhasil dibuat.`)
      }

      setOpen(false)
      await load()
    }catch(error){
      setMessage(error instanceof Error?error.message:'Gagal menyimpan karyawan.')
    }finally{
      setBusy(false)
    }
  }

  const openReset=(row:EmployeeRow)=>{
    const password=generatePassword()
    setResetEmployee(row);setResetPassword(password);setResetConfirm(password);setMessage('')
  }

  const submitReset=async(event:FormEvent)=>{
    event.preventDefault()
    if(!resetEmployee)return
    if(resetPassword.length<8){setMessage('Password minimal 8 karakter.');return}
    if(resetPassword!==resetConfirm){setMessage('Konfirmasi password tidak sama.');return}
    setBusy(true);setMessage('')
    try{
      const{error}=await supabase.rpc('v109_owner_reset_employee_password',{
        p_employee_id:resetEmployee.id,p_new_password:resetPassword
      })
      if(error)throw error
      setResetEmployee(null)
      setSuccess(`Password ${resetEmployee.login_id} berhasil diubah.`)
    }catch(error){
      setMessage(error instanceof Error?error.message:'Reset password gagal.')
    }finally{
      setBusy(false)
    }
  }

  const deactivate=async(row:EmployeeRow)=>{
    if(!window.confirm(`Nonaktifkan akun ${row.login_id}?`))return
    const{error}=await supabase.rpc('v109_set_employee_active',{p_id:row.id,p_active:false})
    if(error)setMessage(error.message)
    else{setSuccess(`Akun ${row.login_id} dinonaktifkan.`);await load()}
  }

  return <>
    <PageHeader
      eyebrow="ENTERPRISE USER MANAGEMENT"
      title="Karyawan & Hak Akses"
      description="Kelola ID Akun, password, status, dan hak akses seluruh modul."
      action={<button className="primary-button" onClick={create}><Plus size={17}/>Tambah Karyawan</button>}
    />

    <section className="panel employee-auth-note employee-auth-ready">
      <KeyRound size={22}/>
      <div>
        <b>Akun tersimpan di Supabase</b>
        <span>ID Akun dan hak akses tetap sama saat pindah laptop, tablet, atau iPhone. Password disimpan dalam bentuk hash.</span>
      </div>
    </section>

    {message&&<div className="error-box inline-message">{message}</div>}
    {success&&<div className="success-box inline-message">{success}</div>}

    <section className="panel data-panel">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Karyawan</th><th>ID Akun</th><th>Status</th><th>Login Terakhir</th>
              <th>Hak Akses</th><th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={6} className="table-empty">Memuat karyawan...</td></tr>}
            {!loading&&rows.length===0&&<tr><td colSpan={6} className="table-empty">Belum ada karyawan.</td></tr>}
            {rows.map(row=><tr key={row.id}>
              <td><b>{row.full_name}</b>{row.phone&&<small>{row.phone}</small>}</td>
              <td><b className="employee-login-id">{row.login_id}</b></td>
              <td><span className={`badge ${row.is_active?'success-badge':'danger-badge'}`}>{row.is_active?'Aktif':'Nonaktif'}</span></td>
              <td>{row.last_login_at?new Date(row.last_login_at).toLocaleString('id-ID'):'Belum pernah'}</td>
              <td><div className="permission-mini-list">{permissionOptions.filter(([key])=>row[key]).map(([key,label])=><span key={key}>{label}</span>)}</div></td>
              <td><div className="row-actions employee-row-actions">
                <button title="Edit" onClick={()=>edit(row)}><Pencil size={16}/></button>
                <button title="Reset Password" onClick={()=>openReset(row)}><RefreshCw size={16}/></button>
                <button className="danger-icon" title="Nonaktifkan" onClick={()=>void deactivate(row)}><Trash2 size={16}/></button>
              </div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {open&&<Modal title={editing?'Edit Karyawan':'Tambah Karyawan'} onClose={()=>setOpen(false)}>
      <form className="modal-form" onSubmit={save}>
        <div className="employee-form-head"><UserRound size={22}/><div><b>Data Karyawan</b><span>ID Akun dibuat manual Owner dan harus unik.</span></div></div>

        <div className="form-grid-two">
          <label>Nama Karyawan<input value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} required/></label>
          <label>ID Akun<input value={form.login_id} onChange={e=>setForm({...form,login_id:e.target.value.toUpperCase()})} placeholder="Contoh: KASIR1" required/></label>
        </div>
        <label>No. WhatsApp<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="08..."/></label>

        {!editing&&<div className="employee-password-box">
          <div className="employee-password-title"><KeyRound size={18}/><b>Password Login</b></div>
          <div className="form-grid-two">
            <label>Password
              <div className="password-field">
                <input type={showPassword?'text':'password'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} minLength={8} required/>
                <button type="button" onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button>
              </div>
            </label>
            <label>Konfirmasi Password<input type={showPassword?'text':'password'} value={form.confirm_password} onChange={e=>setForm({...form,confirm_password:e.target.value})} minLength={8} required/></label>
          </div>
          <button type="button" className="secondary-button employee-generate-password" onClick={()=>{
            const password=generatePassword()
            setForm({...form,password,confirm_password:password})
            setShowPassword(true)
          }}><WandSparkles size={16}/>Generate Password</button>
        </div>}

        <div className="employee-permission-box">
          <header><ShieldCheck size={19}/><div><b>Hak Akses Menu</b><small>Pilih modul yang boleh dipakai karyawan.</small></div></header>
          <div className="employee-permission-grid employee-permission-grid-final">
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
          <button className="primary-button" disabled={busy}>{busy?'Menyimpan...':editing?'Simpan Perubahan':'Buat Akun Karyawan'}</button>
        </div>
      </form>
    </Modal>}

    {resetEmployee&&<Modal title={`Reset Password — ${resetEmployee.login_id}`} onClose={()=>setResetEmployee(null)}>
      <form className="modal-form" onSubmit={submitReset}>
        <div className="employee-password-box">
          <div className="employee-password-title"><RefreshCw size={18}/><div><b>Password Baru</b><small>{resetEmployee.full_name}</small></div></div>
          <div className="form-grid-two">
            <label>Password Baru<input type="text" value={resetPassword} onChange={e=>setResetPassword(e.target.value)} minLength={8} required/></label>
            <label>Konfirmasi<input type="text" value={resetConfirm} onChange={e=>setResetConfirm(e.target.value)} minLength={8} required/></label>
          </div>
          <button type="button" className="secondary-button" onClick={()=>{
            const password=generatePassword()
            setResetPassword(password);setResetConfirm(password)
          }}><WandSparkles size={16}/>Generate Password Baru</button>
        </div>
        {message&&<div className="error-box">{message}</div>}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={()=>setResetEmployee(null)}>Batal</button>
          <button className="primary-button" disabled={busy}>{busy?'Memproses...':'Reset Password'}</button>
        </div>
      </form>
    </Modal>}
  </>
}
