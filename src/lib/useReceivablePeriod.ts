import {useCallback,useEffect,useMemo,useState} from 'react'
import {loadReceivables,remainingReceivable} from './receivables'

// Read-only, account-scoped cache. Does not supply any payment form.
export function useReceivablePeriod(asOf:string,enabled:boolean,scope:string){
 const cache=useMemo(()=>new Map<string,{total:number;at:number}>(),[scope])
 const key=JSON.stringify([scope,asOf])
 const [state,setState]=useState<{key:string;total?:number;error:string}>({key:'',error:''})
 const [revision,setRevision]=useState(0)
 const refresh=useCallback(()=>{cache.clear();setState({key:'',error:''});setRevision(n=>n+1)},[cache])
 useEffect(()=>{
  window.addEventListener('focus',refresh);window.addEventListener('happylaundry-data-invalidated',refresh)
  const timer=enabled?window.setInterval(refresh,60000):undefined
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('happylaundry-data-invalidated',refresh)}
 },[enabled,refresh])
 useEffect(()=>{
  let active=true
  if(!enabled)return()=>{active=false}
  const saved=cache.get(key)
  if(saved&&Date.now()-saved.at<30000){setState({key,total:saved.total,error:''});return()=>{active=false}}
  setState({key,error:''})
  void loadReceivables(asOf).then(rows=>{
   if(!active)return
   const total=rows.reduce((s,r)=>s+remainingReceivable(r),0)
   if(cache.size>=12)cache.delete(cache.keys().next().value!)
   cache.set(key,{total,at:Date.now()});setState({key,total,error:''})
  },e=>{if(active)setState({key,error:e instanceof Error?e.message:String(e)})})
  return()=>{active=false}
 },[key,asOf,enabled,cache,revision])
 const saved=cache.get(key),instant=saved&&Date.now()-saved.at<30000?saved.total:undefined
 const selected=state.key===key?state:undefined
 const total=selected?.total??instant
 return {total:enabled?total:undefined,error:selected?.error||'',loading:enabled&&total===undefined&&!selected?.error,refresh}
}
