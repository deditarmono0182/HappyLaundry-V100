import{createContext,useContext,useEffect,useMemo,useRef,useState}from'react'
import type{Session}from'@supabase/supabase-js'
import{isSupabaseConfigured,supabase}from'./supabase'
import type{EmployeePermissions,UserProfile}from'../types/auth'
import{retry,withTimeout}from'./network'

interface EmployeeSessionRow{
  id:string
  full_name:string
  login_id:string
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
}

interface EmployeeLoginResult{
  ok:boolean
  login_token?:string
  message?:string
}

interface C{
  session:Session|null
  profile:UserProfile|null
  loading:boolean
  signIn:(login:string,password:string)=>Promise<void>
  signOut:()=>Promise<void>
}

const X=createContext<C|null>(null)

function employeeToProfile(row:EmployeeSessionRow):UserProfile{
  const permissions:EmployeePermissions={
    dashboard:Boolean(row.dashboard),
    cashier:Boolean(row.cashier),
    orders:Boolean(row.orders),
    qr_center:Boolean(row.qr_center),
    production:Boolean(row.production),
    customers:Boolean(row.customers),
    services:Boolean(row.services),
    payments:Boolean(row.payments),
    receivables:Boolean(row.receivables),
    finance:Boolean(row.finance),
    cash:Boolean(row.cash),
    reports:Boolean(row.reports),
    backup:Boolean(row.backup),
    settings:Boolean(row.settings)
  }
  return{
    id:row.id,
    full_name:row.full_name,
    login_id:row.login_id,
    role:'employee',
    store_id:null,
    permissions,
    employee_active:Boolean(row.is_active)
  }
}

function deviceLabel(){
  const ua=navigator.userAgent||''
  if(/iPhone/i.test(ua))return 'iPhone'
  if(/iPad/i.test(ua))return 'iPad'
  if(/Android/i.test(ua))return 'Android'
  if(/Windows/i.test(ua))return 'Windows'
  if(/Macintosh/i.test(ua))return 'Mac'
  return 'Browser'
}

export function AuthProvider({children}:{children:React.ReactNode}){
  const[session,setSession]=useState<Session|null>(null)
  const[profile,setProfile]=useState<UserProfile|null>(null)
  const[loading,setLoading]=useState(true)
  const authTransitionRef=useRef(false)
  const profileLoadSeqRef=useRef(0)

  useEffect(()=>{
    if(!isSupabaseConfigured){setLoading(false);return}
    let mounted=true

    const loadProfile=async(current:Session|null)=>{
      const seq=++profileLoadSeqRef.current
      if(!current){
        if(mounted&&seq===profileLoadSeqRef.current)setProfile(null)
        return
      }

      if(!current.user.is_anonymous){
        const{data:base}=await retry(()=>withTimeout(
          supabase
            .from('profiles')
            .select('id,full_name,role,store_id')
            .eq('id',current.user.id)
            .maybeSingle(),
          10000,
          'Memuat profil Owner'
        ),3)
        if(base){
          if(mounted&&seq===profileLoadSeqRef.current)setProfile(base as UserProfile)
          return
        }
      }

      const{data,error}=await retry(()=>withTimeout(
        supabase.rpc('v109_current_employee'),
        10000,
        'Memuat profil Karyawan'
      ),3)
      if(!error&&data){
        const row=(Array.isArray(data)?data[0]:data) as EmployeeSessionRow|undefined
        if(row&&mounted&&seq===profileLoadSeqRef.current){
          setProfile(employeeToProfile(row))

          // V112.0: login alone does NOT count as attendance.
          // Attendance requires QR toko + GPS verification.
          return
        }
      }

      // Jangan langsung menghapus profil aktif karena satu kegagalan RPC sementara.
      // Ini penting untuk koneksi mobile yang kadang lambat setelah anonymous session refresh.
      if(mounted&&seq===profileLoadSeqRef.current){
        setProfile(previous=>previous??null)
      }
    }

    retry(()=>withTimeout(supabase.auth.getSession(),10000,'Memuat sesi'),2).then(async({data})=>{
      if(!mounted)return
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    }).catch(()=>{if(mounted){setSession(null);setProfile(null);setLoading(false)}})

    const{data:s}=supabase.auth.onAuthStateChange((event,next)=>{
      // Saat proses ganti/login akun karyawan, event SIGNED_OUT/SIGNED_IN dapat
      // datang berurutan sangat cepat. Jangan biarkan event sementara itu
      // menimpa session/profile yang sedang kita bangun.
      if(authTransitionRef.current)return

      setSession(next)

      if(event==='SIGNED_OUT'||!next){
        ++profileLoadSeqRef.current
        setProfile(null)
        setLoading(false)
        return
      }

      window.setTimeout(()=>{
        if(!mounted||authTransitionRef.current)return
        void loadProfile(next).finally(()=>{
          if(mounted&&!authTransitionRef.current)setLoading(false)
        })
      },0)
    })

    return()=>{mounted=false;s.subscription.unsubscribe()}
  },[])

  const value=useMemo<C>(()=>({
    session,
    profile,
    loading,
    signIn:async(login,password)=>{
      if(!isSupabaseConfigured)throw new Error('Supabase belum dikonfigurasi.')
      const raw=login.trim()
      if(!raw)throw new Error('ID Akun wajib diisi.')

      if(raw.includes('@')){
        localStorage.removeItem('happylaundry-employee-session-start')
        const{error}=await retry(()=>withTimeout(supabase.auth.signInWithPassword({email:raw.toLowerCase(),password}),15000,'Login Owner'),3)
        if(error){
          if(/invalid login credentials|invalid.*password/i.test(error.message))throw new Error('Email Owner atau password salah.')
          throw error
        }
        return
      }

      authTransitionRef.current=true
      setLoading(true)
      ++profileLoadSeqRef.current

      try{
        // Bersihkan binding akun karyawan lama lebih dulu jika HP/browser dipakai
        // bergantian oleh beberapa karyawan.
        const current=(await retry(()=>withTimeout(supabase.auth.getSession(),10000,'Memeriksa sesi lama'),2)).data.session
        if(current){
          if(current.user.is_anonymous){
            try{await withTimeout(supabase.rpc('v109_employee_logout'),8000,'Melepas akun karyawan lama')}catch{}
          }
          try{await withTimeout(supabase.auth.signOut(),10000,'Menutup sesi lama')}catch{}
        }

        // Pastikan browser benar-benar tidak memegang sesi lama sebelum login baru.
        const afterSignOut=(await retry(()=>withTimeout(supabase.auth.getSession(),10000,'Memastikan sesi lama sudah tertutup'),2)).data.session
        if(afterSignOut){
          try{await supabase.auth.signOut()}catch{}
        }

        setSession(null)
        setProfile(null)

        const{data:loginData,error:loginError}=await retry(()=>withTimeout(supabase.rpc('v109_employee_login',{
          p_login_id:raw.toUpperCase(),
          p_password:password,
          p_device:deviceLabel()
        }),15000,'Login Karyawan'),3)
        if(loginError)throw new Error(loginError.message)

        const result=(Array.isArray(loginData)?loginData[0]:loginData) as EmployeeLoginResult|undefined
        if(!result?.ok||!result.login_token)throw new Error(result?.message||'ID Akun atau password salah.')

        const{error:anonymousError}=await retry(()=>withTimeout(supabase.auth.signInAnonymously({
          options:{data:{happylaundry_employee:true,employee_login_id:raw.toUpperCase()}}
        }),15000,'Membuka sesi Karyawan'),3)
        if(anonymousError){
          throw new Error('Anonymous Sign-In Supabase belum aktif. Aktifkan Authentication → Sign In / Providers → Anonymous.')
        }

        const{data:bindData,error:bindError}=await retry(()=>withTimeout(supabase.rpc('v109_bind_employee_session',{
          p_login_token:result.login_token
        }),15000,'Mengaktifkan sesi Karyawan'),3)
        if(bindError||bindData!==true){
          try{await supabase.auth.signOut()}catch{}
          throw new Error(bindError?.message||'Gagal mengaktifkan sesi karyawan.')
        }

        const verified=await retry(()=>withTimeout(
          supabase.rpc('v109_current_employee'),
          10000,
          'Verifikasi profil Karyawan'
        ),3)
        if(verified.error||!verified.data){
          try{await supabase.auth.signOut()}catch{}
          throw new Error(verified.error?.message||'Profil karyawan belum dapat dimuat. Silakan coba login lagi.')
        }

        const verifiedRow=(Array.isArray(verified.data)?verified.data[0]:verified.data) as EmployeeSessionRow|undefined
        if(!verifiedRow||!verifiedRow.is_active){
          try{await supabase.auth.signOut()}catch{}
          throw new Error('Akun karyawan tidak aktif atau profil belum tersedia.')
        }

        const sessionResult=await retry(()=>withTimeout(supabase.auth.getSession(),10000,'Membaca sesi Karyawan'),2)
        if(!sessionResult.data.session){
          throw new Error('Sesi karyawan gagal dibuat. Silakan login ulang.')
        }

        // Marker dan identitas aktif ditulis sebelum membuka aplikasi.
        localStorage.setItem('happylaundry-employee-session-start',String(Date.now()))
        localStorage.setItem('happylaundry-active-employee-id',verifiedRow.id)
        localStorage.setItem('happylaundry-active-employee-login',verifiedRow.login_id)

        setSession(sessionResult.data.session)
        setProfile(employeeToProfile(verifiedRow))
      }catch(error){
        localStorage.removeItem('happylaundry-employee-session-start')
        localStorage.removeItem('happylaundry-active-employee-id')
        localStorage.removeItem('happylaundry-active-employee-login')
        try{await supabase.auth.signOut()}catch{}
        setSession(null)
        setProfile(null)
        throw error
      }finally{
        authTransitionRef.current=false
        setLoading(false)
      }

      // V113.0.127: one browser can safely switch between employee accounts.
    },
    signOut:async()=>{
      authTransitionRef.current=true
      ++profileLoadSeqRef.current
      localStorage.removeItem('happylaundry-employee-session-start')
      localStorage.removeItem('happylaundry-active-employee-id')
      localStorage.removeItem('happylaundry-active-employee-login')
      try{await supabase.rpc('v109_employee_logout')}catch{}
      try{await supabase.auth.signOut()}finally{
        setSession(null)
        setProfile(null)
        setLoading(false)
        authTransitionRef.current=false
      }
    }
  }),[session,profile,loading])

  return <X.Provider value={value}>{children}</X.Provider>
}

export function useAuth(){
  const v=useContext(X)
  if(!v)throw new Error('AuthProvider belum aktif')
  return v
}
