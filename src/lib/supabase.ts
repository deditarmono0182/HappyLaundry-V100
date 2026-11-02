import { createClient } from '@supabase/supabase-js'
import {createOperationalReadFetch,clearOperationalReads} from './operationalReadFetch'
const url=import.meta.env.VITE_SUPABASE_URL as string|undefined
const key=import.meta.env.VITE_SUPABASE_ANON_KEY as string|undefined
export const isSupabaseConfigured=Boolean(url&&key)
export const supabase=createClient(url||'https://placeholder.supabase.co',key||'placeholder',{global:{fetch:createOperationalReadFetch()},auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
supabase.auth.onAuthStateChange(()=>clearOperationalReads())
