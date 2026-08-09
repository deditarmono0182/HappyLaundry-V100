import { supabase } from './supabase'

export type DeleteEntityType='order'|'expense'

export async function requestDelete(entityType:DeleteEntityType,entityId:string,reason:string){
  return supabase.rpc('v11306_request_delete',{
    p_entity_type:entityType,
    p_entity_id:entityId,
    p_reason:reason
  })
}

export async function ownerDeleteDirect(entityType:DeleteEntityType,entityId:string,reason:string){
  return supabase.rpc('v11306_owner_delete_direct',{
    p_entity_type:entityType,
    p_entity_id:entityId,
    p_reason:reason
  })
}

export async function removeDeleteFiles(result:any){
  const files=Array.isArray(result?.files)?result.files:[]
  const grouped=new Map<string,string[]>()
  for(const file of files){
    if(!file?.bucket||!file?.path)continue
    const list=grouped.get(file.bucket)||[]
    list.push(file.path)
    grouped.set(file.bucket,list)
  }
  for(const [bucket,paths] of grouped){
    try{await supabase.storage.from(bucket).remove(paths)}catch{}
  }
}
