import{createContext,useContext,useEffect,useMemo,useState}from'react'
import type{Session}from'@supabase/supabase-js'
import{isSupabaseConfigured,supabase}from'./supabase'
import type{EmployeePermissions,UserProfile}from'../types/auth'

interface C{
  session:Session|null
  profile:UserProfile|null
  loading:boolean
  signIn:(e:string,p:string)=>Promise<void>
  signOut:()=>Promise<void>
}

const X=createContext<C|null>(null)

const defaultEmployeePermissions:EmployeePermissions={
  dashboard:false,
  cashier:false,
  orders:false,
  qr_center:false,
  production:false,
  customers:false,
  services:false
}

export function AuthProvider({children}:{children:React.ReactNode}){
  const[session,setSession]=useState<Session|null>(null)
  const[profile,setProfile]=useState<UserProfile|null>(null)
  const[loading,setLoading]=useState(true)

  useEffect(()=>{
    if(!isSupabaseConfigured){setLoading(false);return}
    let mounted=true

    const load=async(id:string,email?:string|null)=>{
      const{data:base}=await supabase
        .from('profiles')
        .select('id,full_name,role,store_id')
        .eq('id',id)
        .maybeSingle()

      let next=(base as UserProfile|null)??null

      // Owner follows the profile table and always keeps full access.
      if(next?.role==='owner'){
        if(mounted)setProfile(next)
        return
      }

      if(email){
        const{data:employee}=await supabase
          .from('v107_employee_access')
          .select('full_name,is_active,dashboard,cashier,orders,qr_center,production,customers,services')
          .eq('email',email.toLowerCase())
          .maybeSingle()

        if(employee){
          const permissions:EmployeePermissions={
            dashboard:Boolean(employee.dashboard),
            cashier:Boolean(employee.cashier),
            orders:Boolean(employee.orders),
            qr_center:Boolean(employee.qr_center),
            production:Boolean(employee.production),
            customers:Boolean(employee.customers),
            services:Boolean(employee.services)
          }
          next={
            id,
            full_name:employee.full_name||next?.full_name||email,
            role:'employee',
            store_id:next?.store_id??null,
            permissions,
            employee_active:Boolean(employee.is_active)
          }
        }else if(next){
          // Existing legacy cashier/staff accounts keep their former role behavior.
          next={...next,permissions:defaultEmployeePermissions,employee_active:true}
        }
      }

      if(mounted)setProfile(next)
    }

    supabase.auth.getSession().then(async({data})=>{
      if(!mounted)return
      setSession(data.session)
      if(data.session?.user.id)await load(data.session.user.id,data.session.user.email)
      setLoading(false)
    })

    const{data:s}=supabase.auth.onAuthStateChange(async(_e,n)=>{
      setSession(n)
      if(n?.user.id)await load(n.user.id,n.user.email)
      else setProfile(null)
      setLoading(false)
    })

    return()=>{mounted=false;s.subscription.unsubscribe()}
  },[])

  const value=useMemo<C>(()=>({
    session,profile,loading,
    signIn:async(email,password)=>{
      if(!isSupabaseConfigured)throw new Error('Supabase belum dikonfigurasi.')
      const{error}=await supabase.auth.signInWithPassword({email,password})
      if(error)throw error
    },
    signOut:async()=>{await supabase.auth.signOut()}
  }),[session,profile,loading])

  return <X.Provider value={value}>{children}</X.Provider>
}

export function useAuth(){
  const v=useContext(X)
  if(!v)throw new Error('AuthProvider belum aktif')
  return v
}
