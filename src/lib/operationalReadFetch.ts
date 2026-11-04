// Session-memory optimization. Transaction rows and salary/payment totals have no TTL cache.
const referenceTables=new Set(['v100_store_settings','v106_expense_categories','v110_receipt_print_settings'])
const sharedRPCs=new Set(['v113168_receivables_as_of','v113165_financial_summary','v113151_manager_report','v113072_my_payroll_base','v113072_my_commissions','v113072_my_revenue_share','v113151_my_manager_share','v113144_search_orders'])
const readRPCs=new Set([...sharedRPCs,'v109_current_employee','v11322_current_attendance_state','v113122_finance_list_employees','v113139_finance_cash_advance_summary','v113134_owner_cash_advance_report','v113137_cash_advance_limits','v113_list_commission_employees','v113037_list_safety_snapshots','v103_public_order_tracking','v1129_public_payment_options','v11324_daily_closing_summary'])
type Saved={response:Response;expires:number;bytes:number}
const saved=new Map<string,Saved>(),pending=new Map<string,Promise<Response>>()
let generation=0,totalBytes=0
const TTL=30_000,MAX_BYTES=8*1024*1024,MAX_ENTRY=1024*1024
export function clearOperationalReads(){generation++;saved.clear();pending.clear();totalBytes=0}
let channel:BroadcastChannel|undefined
if(typeof window!=='undefined'){
 window.addEventListener('focus',clearOperationalReads)
 try{if(typeof window.BroadcastChannel==='function'){channel=new window.BroadcastChannel('happylaundry-data-invalidated');channel.onmessage=()=>{clearOperationalReads();window.dispatchEvent(new Event('happylaundry-data-invalidated'))}}}catch{channel=undefined}
}
function invalidate(notify=false){clearOperationalReads();if(notify){channel?.postMessage('changed');if(typeof window!=='undefined')window.dispatchEvent(new Event('happylaundry-data-invalidated'))}}
export function createOperationalReadFetch(fetcher:typeof fetch=fetch):typeof fetch{
 return async(input,init)=>{
  const request=input instanceof Request?input:null,url=new URL(request?.url||String(input),typeof window!=='undefined'?window.location.origin:'http://localhost')
  const method=(init?.method||request?.method||'GET').toUpperCase(),headers=new Headers(request?.headers)
  new Headers(init?.headers).forEach((v,k)=>headers.set(k,v))
  const match=url.pathname.match(/\/rest\/v1\/(?:rpc\/([^/]+)|([^/]+))$/)
  const readRPC=method==='POST'&&!!match?.[1]&&readRPCs.has(match[1])
  const mutation=(!!match&&method!=='GET'&&method!=='HEAD'&&!readRPC)||url.pathname.includes('/auth/')
  if(mutation){invalidate();try{return await fetcher(input,init)}finally{invalidate(true)}}
  // Skip requests carrying a cancellation signal: their lifecycle belongs to their caller.
  const canShare=!!match&&(method==='GET'||(readRPC&&sharedRPCs.has(match![1])))&&!request&&!init?.signal&&init?.cache!=='no-store'
  if(!canShare)return fetcher(input,init)
  const cacheable=method==='GET'&&referenceTables.has(match![2]||'')
  // Authorization and all range/preference headers are part of the opaque in-memory key.
  const key=JSON.stringify([url.href,method,[...headers.entries()].sort(),readRPC?init?.body:null])
  const hit=saved.get(key)
  if(hit&&hit.expires>Date.now()){saved.delete(key);saved.set(key,hit);return hit.response.clone()}
  if(hit){totalBytes-=hit.bytes;saved.delete(key)}
  const inflight=pending.get(key);if(inflight)return (await inflight).clone()
  const epoch=generation
  const task=(async()=>{
   const response=await fetcher(input,init)
   if(cacheable&&response.ok&&epoch===generation){
    const bytes=(await response.clone().arrayBuffer()).byteLength
    if(epoch===generation&&bytes<=MAX_ENTRY){
     while(saved.size>=64||totalBytes+bytes>MAX_BYTES){const oldest=saved.keys().next().value;if(oldest===undefined)break;const old=saved.get(oldest)!;totalBytes-=old.bytes;saved.delete(oldest)}
     saved.set(key,{response:response.clone(),expires:Date.now()+TTL,bytes});totalBytes+=bytes
    }
   }
   return response
  })()
  pending.set(key,task)
  try{return (await task).clone()}finally{if(pending.get(key)===task)pending.delete(key)}
 }
}
