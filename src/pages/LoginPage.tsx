import{FormEvent,useState}from'react'
import{Navigate}from'react-router-dom'
import{useAuth}from'../lib/auth'
import{isSupabaseConfigured}from'../lib/supabase'

export function LoginPage(){
  const{session,signIn}=useAuth()
  const[loginId,setLoginId]=useState('')
  const[password,setPassword]=useState('')
  const[error,setError]=useState('')
  const[busy,setBusy]=useState(false)

  if(session)return <Navigate to="/" replace/>

  const submit=async(e:FormEvent)=>{
    e.preventDefault()
    setError('')
    setBusy(true)
    try{
      await signIn(loginId,password)
    }catch(r){
      setError(r instanceof Error?r.message:'Login gagal.')
    }finally{
      setBusy(false)
    }
  }

  return <div className="login-page">
    <div className="login-card login-card-v108">
      <img src="/logo-happylaundry.jpg" className="login-logo" alt="HappyLaundry"/>
      <span className="eyebrow">HAPPYLAUNDRY BABAKAN</span>
      <h1>Masuk ke HappyLaundry</h1>
      <p>Karyawan gunakan ID Akun. Owner tetap dapat menggunakan email Owner.</p>
      {!isSupabaseConfigured&&<div className="warning-box">Supabase belum dikonfigurasi.</div>}
      <form onSubmit={submit}>
        <label>ID Akun
          <input
            value={loginId}
            onChange={e=>setLoginId(e.target.value)}
            placeholder="Contoh: KASIR1"
            autoComplete="username"
            required
          />
        </label>
        <label>Password
          <input
            type="password"
            value={password}
            onChange={e=>setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error&&<div className="error-box">{error}</div>}
        <button disabled={busy||!isSupabaseConfigured}>{busy?'Memproses...':'Login'}</button>
      </form>
      <small className="login-owner-note">Untuk Owner lama: email Owner tetap bisa digunakan pada kolom ID Akun.</small>
    </div>
  </div>
}
