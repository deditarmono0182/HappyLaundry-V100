import {useCallback,useEffect,useMemo,useState} from 'react'
import {fetchFinancialSummary,type FinancialSummary} from './financialSummary'

// Per-mounted-page and per-account cache; never used to submit a payment or change a balance.
export function useFinancialPeriod(from:string,to:string,enabled:boolean,scope:string){
 const group=useMemo(()=>({values:new Map<string,{value:FinancialSummary;at:number}>(),pending:new Map<string,Promise<FinancialSummary>>(),epoch:0}),[scope])
 const key=JSON.stringify([scope,from,to])
 const [state,setState]=useState<{key:string;value?:FinancialSummary;error:string;loading:boolean}>({key:'',error:'',loading:true})
 const [revision,setRevision]=useState(0)
 const refresh=useCallback(()=>{group.epoch++;group.values.clear();group.pending.clear();setState({key:'',error:'',loading:true});setRevision(v=>v+1)},[group])
 useEffect(()=>{const timer=enabled?window.setInterval(refresh,60000):undefined;window.addEventListener('focus',refresh);window.addEventListener('happylaundry-data-invalidated',refresh);return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('happylaundry-data-invalidated',refresh)}},[refresh,enabled])
 useEffect(()=>{
  let active=true
  if(!enabled||!from||!to||from>to){setState({key,error:from>to?'Periode tidak valid.':'',loading:false});return()=>{active=false}}
  const cached=group.values.get(key)
  if(cached&&Date.now()-cached.at<30_000){setState({key,value:cached.value,error:'',loading:false});return()=>{active=false}}
  setState({key,error:'',loading:true})
  const epoch=group.epoch
  let request=group.pending.get(key)
  if(!request){
   request=fetchFinancialSummary(from,to).then(value=>{
    if(group.epoch===epoch){if(group.values.size>=12)group.values.delete(group.values.keys().next().value!);group.values.set(key,{value,at:Date.now()})}
    return value
   })
   group.pending.set(key,request)
   void request.finally(()=>{if(group.pending.get(key)===request)group.pending.delete(key)}).catch(()=>{})
  }
  void request.then(value=>{if(active&&epoch===group.epoch)setState({key,value,error:'',loading:false})},e=>{if(active&&epoch===group.epoch)setState({key,error:String(e?.message||e),loading:false})})
  return()=>{active=false}
 },[from,to,key,enabled,group,revision])
 const cached=group.values.get(key)
 const instant=cached&&Date.now()-cached.at<30_000?cached.value:undefined
 const selected=state.key===key?state:undefined
 return {financial:enabled?(selected?.value||instant):undefined,loading:enabled?(selected?.loading??!instant):false,error:selected?.error||'',refresh,identity:key}
}
