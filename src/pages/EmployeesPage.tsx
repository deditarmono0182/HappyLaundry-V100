import { FormEvent, useCallback, useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  Copy, Eye, EyeOff, KeyRound, MessageCircle, Pencil, Plus,
  ShieldCheck, Trash2, UserRound, WandSparkles
} from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'

interface EmployeeRow{
  id:string
  full_name:string
  login_id:string
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

const employeeAuthClient=createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth:{
      persistSession:false,
      autoRefreshToken:false,
      detectSessionInUrl:false
    }
  }
)

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
  full_name:'',login_id:'',phone:'',is_active:true,
  dashboard:true,cashier:true,orders:true,qr_center:true,
  production:false,customers:true,services:true,
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
  const[createdLogin,setCreatedLogin]=useState<{name:string;login_id:string;password:string;phone:string|null}|null>(null)

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
    const password=generatePassword()
    setEditing(null)
    setForm({...emptyForm,password,confirm_password:password})
    setShowPassword(false);setMessage('');setSuccess('');setCreatedLogin(null);setOpen(true)
  }

  const edit=(row:EmployeeRow)=>{
    setEditing(row)
    setForm({
      full_name:row.full_name,login_id:row.login_id||'',phone:row.phone||'',
      is_active:row.is_active,dashboard:row.dashboard,cashier:row.cashier,
      orders:row.orders,qr_center:row.qr_center,production:row.production,
      customers:row.customers,services:row.services,
      password:'',confirm_password:''
    })
    setMessage('');setSuccess('');setCreatedLogin(null);setOpen(true)
  }


  const save=async(event:FormEvent)=>{
    event.preventDefault();setBusy(true);setMessage('');setSuccess('')
    try{
      const loginId=form.login_id.trim().toUpperCase().replace(/[^A-Z0-9._-]/g,'')
      if(!loginId)throw new Error('ID Akun wajib diisi.')
      if(loginId.length<3)throw new Error('ID Akun minimal 3 karakter.')
      const internalEmail=`${loginId.toLowerCase()}@employee.happylaundry.local`

      const payload={
        full_name:form.full_name.trim(),
        login_id:loginId,
        email:internalEmail,
        phone:form.phone.trim()||null,
        is_active:form.is_active,
        dashboard:form.dashboard,cashier:form.cashier,orders:form.orders,
        qr_center:form.qr_center,production:form.production,
        customers:form.customers,services:form.services,
        updated_at:new Date().toISOString()
      }

      if(editing){
        const{error}=await supabase.from('v107_employee_access').update(payload).eq('id',editing.id)
        if(error)throw error
        setOpen(false)
        setSuccess('Data karyawan dan hak akses berhasil diperbarui.')
      }else{
        if(form.password.length<8)throw new Error('Password minimal 8 karakter.')
        if(form.password!==form.confirm_password)throw new Error('Konfirmasi password tidak sama.')

        // Buat akun memakai client Auth terpisah agar sesi Owner tidak berubah.
        const{data:signUpData,error:signUpError}=await employeeAuthClient.auth.signUp({
          login_id:payload.login_id,
          password:form.password,
          options:{
            data:{full_name:payload.full_name,login_id:payload.login_id}
          }
        })
        if(signUpError)throw signUpError

        // Simpan hak akses setelah akun Auth berhasil dibuat.
        const{error:accessError}=await supabase.from('v107_employee_access').insert({
          ...payload
        })
        if(accessError)throw accessError

        setCreatedLogin({
          name:payload.full_name,
          login_id:payload.login_id,
          password:form.password,
          phone:payload.phone
        })
        setOpen(false)
        setSuccess(signUpData.session
          ? 'Karyawan dan ID Akun berhasil dibuat. Akun sudah bisa dipakai.'
          : 'ID Akun berhasil disiapkan, tetapi Supabase Email Confirmation masih aktif. Matikan Confirm Email agar login ID dapat langsung digunakan.')
      }

      await load()
    }catch(error){
      setMessage(error instanceof Error?error.message:'Gagal menyimpan karyawan.')
    }finally{
      setBusy(false)
    }
  }

  const remove=async(row:EmployeeRow)=>{
    if(!window.confirm(`Nonaktifkan karyawan ${row.full_name}? Karyawan tidak dapat memakai menu HappyLaundry.`))return
    const{error}=await supabase.from('v107_employee_access').update({
      is_active:false,updated_at:new Date().toISOString()
    }).eq('id',row.id)
    if(error)setMessage(error.message)
    else await load()
  }


  const copyLogin=async()=>{
    if(!createdLogin)return
    const text=`Login HappyLaundry\nNama: ${createdLogin.name}\nID Akun: ${createdLogin.login_id}\nPassword: ${createdLogin.password}`
    try{
      await navigator.clipboard.writeText(text)
      setSuccess('Informasi login berhasil disalin.')
    }catch{
      setMessage(text)
    }
  }

  const sendLoginWA=()=>{
    if(!createdLogin?.phone){setMessage('Nomor WhatsApp karyawan belum diisi.');return}
    const phone=createdLogin.phone.replace(/\D/g,'').replace(/^0/,'62')
    const text=`Halo ${createdLogin.name}.\n\nAkun HappyLaundry Anda sudah dibuat.\n\nID Akun: ${createdLogin.login_id}\nPassword: ${createdLogin.password}\n\nSilakan login ke aplikasi HappyLaundry. Simpan informasi ini dengan aman dan jangan bagikan password kepada orang lain.`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`,'_blank')
  }

  return <>
    <PageHeader
      eyebrow="EMPLOYEE ACCESS CONTROL"
      title="Karyawan & Hak Akses"
      description="Owner membuat akun login dan menentukan menu yang boleh digunakan setiap karyawan."
      action={<button className="primary-button" onClick={create}><Plus size={17}/>Tambah Karyawan</button>}
    />

    <section className="panel employee-auth-note employee-auth-ready">
      <KeyRound size={22}/>
      <div>
        <b>Akun login dibuat otomatis</b>
        <span>Karyawan login memakai ID Akun + Password. ID ditentukan manual oleh Owner. Password tidak disimpan di tabel HappyLaundry.</span>
      </div>
    </section>

    {message&&<div className="error-box inline-message">{message}</div>}
    {success&&<div className="success-box inline-message">{success}</div>}

    {createdLogin&&<section className="panel employee-login-result">
      <div className="employee-login-result-head">
        <div><b>Informasi Login Karyawan</b><span>Kirim sekali ke karyawan lalu simpan dengan aman.</span></div>
        <div className="employee-login-result-actions">
          <button className="secondary-button" onClick={()=>void copyLogin()}><Copy size={16}/>Copy Login</button>
          <button className="whatsapp-button" onClick={sendLoginWA}><MessageCircle size={16}/>Kirim WhatsApp</button>
        </div>
      </div>
      <div className="employee-login-credentials">
        <div><span>Nama</span><b>{createdLogin.name}</b></div>
        <div><span>ID Akun</span><b>{createdLogin.login_id}</b></div>
        <div><span>Password</span><b>{createdLogin.password}</b></div>
      </div>
    </section>}

    <section className="panel data-panel">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Karyawan</th><th>ID Akun</th><th>Status</th>
              <th>Dashboard</th><th>Kasir</th><th>Order</th><th>QR</th>
              <th>Produksi</th><th>Pelanggan</th><th>Layanan</th><th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading&&<tr><td colSpan={11} className="table-empty">Memuat karyawan...</td></tr>}
            {!loading&&rows.length===0&&<tr><td colSpan={11} className="table-empty">Belum ada karyawan.</td></tr>}
            {rows.map(row=><tr key={row.id}>
              <td><b>{row.full_name}</b>{row.phone&&<small>{row.phone}</small>}</td>
              <td><b className="employee-login-id">{row.login_id||'-'}</b></td>
              <td><span className={`badge ${row.is_active?'success-badge':'danger-badge'}`}>{row.is_active?'Aktif':'Nonaktif'}</span></td>
              {permissionOptions.map(([key])=><td key={key}><span className={`permission-dot ${row[key]?'on':'off'}`}>{row[key]?'✓':'—'}</span></td>)}
              <td><div className="row-actions employee-row-actions">
                <button title="Edit" onClick={()=>edit(row)}><Pencil size={16}/></button>
                <button className="danger-icon" title="Nonaktifkan" onClick={()=>void remove(row)}><Trash2 size={16}/></button>
              </div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {open&&<Modal title={editing?'Edit Karyawan':'Tambah Karyawan & Login'} onClose={()=>setOpen(false)}>
      <form className="modal-form" onSubmit={save}>
        <div className="employee-form-head"><UserRound size={22}/><div><b>{editing?'Data Karyawan':'Data Login Karyawan'}</b><span>{editing?'Edit profil dan akses. Gunakan Reset Password untuk mengganti password.':'ID Akun Authentication dibuat otomatis saat disimpan.'}</span></div></div>

        <div className="form-grid-two">
          <label>Nama Karyawan<input value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} required/></label>
          <label>ID Akun<input value={form.login_id} onChange={e=>setForm({...form,login_id:e.target.value.toUpperCase()})} placeholder="Contoh: KASIR1" required disabled={Boolean(editing)}/></label>
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
            <label>Konfirmasi Password
              <input type={showPassword?'text':'password'} value={form.confirm_password} onChange={e=>setForm({...form,confirm_password:e.target.value})} minLength={8} required/>
            </label>
          </div>
          <button type="button" className="secondary-button employee-generate-password" onClick={()=>{
            const password=generatePassword()
            setForm({...form,password,confirm_password:password})
            setShowPassword(true)
          }}><WandSparkles size={16}/>Generate Password</button>
        </div>}

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
          <button className="primary-button" disabled={busy}>{busy?'Menyimpan...':editing?'Simpan Perubahan':'Buat Akun Karyawan'}</button>
        </div>
      </form>
    </Modal>}
  </>
}
