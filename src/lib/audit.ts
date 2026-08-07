import { supabase } from './supabase'

export async function auditActivity(action:string,entityType?:string,entityId?:string,details?:string){
  try{
    await supabase.rpc('v109_log_activity',{
      p_action:action,
      p_entity_type:entityType||null,
      p_entity_id:entityId||null,
      p_details:details||null
    })
  }catch{}
}
