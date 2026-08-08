import{createContext,useContext,useEffect,useMemo,useState}from'react'
import type{Session}from'@supabase/supabase-js'
import{isSupabaseConfigured,supabase}from'./supabase'
import type{EmployeePermissions,UserProfile}from'../types/auth'

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

  useEffect(()=>{
    if(!isSupabaseConfigured){setLoading(false);return}
    let mounted=true

    const loadProfile=async(current:Session|null)=>{
      if(!current){
        if(mounted)setProfile(null)
        return
      }

      if(!current.user.is_anonymous){
        const{data:base}=await supabase
          .from('profiles')
          .select('id,full_name,role,store_id')
          .eq('id',current.user.id)
          .maybeSingle()
        if(base){
          if(mounted)setProfile(base as UserProfile)
          return
        }
      }

      const{data,error}=await supabase.rpc('v109_current_employee')
      if(!error&&data){
        const row=(Array.isArray(data)?data[0]:data) as EmployeeSessionRow|undefined
        if(row&&mounted){
          setProfile(employeeToProfile(row))

          // V112.0: login alone does NOT count as attendance.
          // Attendance requires QR toko + GPS verification.
          return
        }
      }

      if(mounted)setProfile(null)
    }

    supabase.auth.getSession().then(async({data})=>{
      if(!mounted)return
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })

    const{data:s}=supabase.auth.onAuthStateChange(async(_event,next)=>{
      setSession(next)
      await loadProfile(next)
      setLoading(false)
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
        const{error}=await supabase.auth.signInWithPassword({email:raw.toLowerCase(),password})
        if(error)throw new Error('Email Owner atau password salah.')
        return
      }

      const current=(await supabase.auth.getSession()).data.session
      if(current)await supabase.auth.signOut()

      const{data:loginData,error:loginError}=await supabase.rpc('v109_employee_login',{
        p_login_id:raw.toUpperCase(),
        p_password:password,
        p_device:deviceLabel()
      })
      if(loginError)throw new Error(loginError.message)

      const result=(Array.isArray(loginData)?loginData[0]:loginData) as EmployeeLoginResult|undefined
      if(!result?.ok||!result.login_token)throw new Error(result?.message||'ID Akun atau password salah.')

      const{error:anonymousError}=await supabase.auth.signInAnonymously({
        options:{data:{happylaundry_employee:true}}
      })
      if(anonymousError){
        throw new Error('Anonymous Sign-In Supabase belum aktif. Aktifkan Authentication → Sign In / Providers → Anonymous.')
      }

      const{data:bindData,error:bindError}=await supabase.rpc('v109_bind_employee_session',{
        p_login_token:result.login_token
      })
      if(bindError||bindData!==true){
        await supabase.auth.signOut()
        throw new Error(bindError?.message||'Gagal mengaktifkan sesi karyawan.')
      }


      // V112.0: employee login only opens the app.
      // Attendance is recorded separately through QR + GPS.

      await supabase.auth.refreshSession()
    },
    signOut:async()=>{
      try{await supabase.rpc('v109_employee_logout')}catch{}
      await supabase.auth.signOut()
    }
  }),[session,profile,loading])

  return <X.Provider value={value}>{children}</X.Provider>
}

export function useAuth(){
  const v=useContext(X)
  if(!v)throw new Error('AuthProvider belum aktif')
  return v
}
