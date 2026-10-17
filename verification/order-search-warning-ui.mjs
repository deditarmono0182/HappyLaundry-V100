import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/orders'})
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
globalThis.__rpcCalls=[]
const order=(id,name)=>({id,order_no:'HL-'+id,customer_name:name,customer_phone:'081',status:'received',payment_status:'unpaid',subtotal:64000,total:64000,discount:0,paid_amount:0,notes:null,due_at:null,created_at:'2026-10-06T06:00:00Z'})
globalThis.__orders={old:order('old','Mamah Alghi'),new:order('new','Pelanggan Baru')}
globalThis.__mock={
 rpc:async(name,args)=>{
  globalThis.__rpcCalls.push([name,args]);
  if(name!=='v113144_search_orders')return {data:[],error:null}
  const q=args.p_query;
  if(q==='error')return {data:null,error:{message:'Koneksi pencarian terputus'}};
  if(q==='lama')await new Promise(r=>globalThis.__releaseOld=r)
  const rows=q==='lama'||q==='00141'?[globalThis.__orders.old]:q==='baru'?[globalThis.__orders.new]:[];
  return {data:rows,error:null}
 },
 from(table){const b={select(){return b},in(){return b},order(){return b},range(){return b},eq(){return b},then(ok){return Promise.resolve({data:[],error:null}).then(ok)}};return b}
}
const result=await build({stdin:{contents:`export {OrdersPage} from './src/pages/OrdersPage';export * from './src/lib/commissionWarnings';export * from './src/lib/orderSearch'`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/lib\/(auth|supabase)$|\.\/supabase$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path.endsWith('auth')?`export const useAuth=()=>({profile:{id:'owner',role:'owner',full_name:'Owner'}})`:`export const supabase=globalThis.__mock`}))}}]})
const file='verification/.order-search-test.mjs';await writeFile(file,result.outputFiles[0].text)
const mod=await import('./.order-search-test.mjs');const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {MemoryRouter}=await import('react-router-dom')
const root=createRoot(document.getElementById('root'))
await act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(mod.OrdersPage))))
const settle=async()=>act(async()=>{await new Promise(r=>setTimeout(r,350))})
await settle()
const setQuery=async(value)=>{const input=document.querySelector('input[placeholder^="Cari seluruh order"]');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
await setQuery('00141');await settle();assert.match(document.body.textContent,/Mamah Alghi/,'old order returned from database appears')
await setQuery('lama');await settle();assert.ok(globalThis.__releaseOld)
await setQuery('baru');await settle();assert.match(document.body.textContent,/Pelanggan Baru/)
await act(async()=>globalThis.__releaseOld());assert.doesNotMatch(document.body.textContent,/Mamah Alghi/,'late prior search cannot overwrite current result')
// Type then immediately clear: pending state must recover even if normalized query is unchanged.
await setQuery('x');await setQuery('');await settle();assert.doesNotMatch(document.body.textContent,/Mencari\.\.\./)
await setQuery('error');await settle();assert.match(document.body.textContent,/Koneksi pencarian terputus/);assert.doesNotMatch(document.body.textContent,/Mencari\.\.\./)
await setQuery('00141');await settle();assert.match(document.body.textContent,/Mamah Alghi/)
const setDate=async(label,value)=>{const input=document.querySelector(`input[aria-label="${label}"]`);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
await setDate('Tanggal masuk dari','2026-10-06');await setDate('Tanggal masuk sampai','2026-10-06');await settle()
assert.equal(globalThis.__rpcCalls.at(-1)[1].p_start_date,'2026-10-06');assert.equal(globalThis.__rpcCalls.at(-1)[1].p_end_date,'2026-10-06')
await act(async()=>document.querySelector('button.order-reset-filter').click());await settle()
assert.equal(globalThis.__rpcCalls.at(-1)[1].p_start_date,null);assert.equal(document.querySelector('input[aria-label="Tanggal masuk sampai"]').value,'')
await act(async()=>root.unmount())
const u1='00000000-0000-0000-0000-000000000001',u2='00000000-0000-0000-0000-000000000002'
const employees=[{id:u1,full_name:'Haris'},{id:u2,full_name:'Cece'}]
const rates=[{employee_id:u1,production_percent:0,courier_percent:0},{employee_id:u2,production_percent:20,courier_percent:20}]
assert.equal(mod.zeroCommissionWarnings([],[],rates,employees).length,0)
assert.equal(mod.zeroCommissionWarnings([u2],[u2],rates,employees).length,0)
assert.equal(mod.zeroCommissionWarnings([u1],[u1],rates,employees).length,2)
assert.equal(mod.zeroCommissionWarnings([],[u2,u1],rates,employees).length,1,'team reference matches SQL UUID order')
assert.equal(mod.zeroCommissionWarnings([],[u1],rates,employees,[{employee_id:u1,commission_type:'courier',total_percent:20}]).length,0,'Haris stored 20% is not warned as zero after correction')
assert.equal(mod.zeroCommissionWarnings([u2],[],rates,employees,[{employee_id:u2,commission_type:'production',total_percent:0}]).length,1,'old zero snapshot still warned after current rate changed')
let confirms=0;window.confirm=()=>{confirms++;return false};assert.equal(mod.confirmZeroCommission(['Kurir 0%']),false)
window.confirm=()=>{confirms++;return true};assert.equal(mod.confirmZeroCommission(['Kurir 0%']),true);assert.equal(mod.confirmZeroCommission([]),true);assert.equal(confirms,2)
// Helper fetches >1000 results in bounded pages, related records beyond the old global cap.
const original=globalThis.__mock.rpc;globalThis.__mock.rpc=async(name,args)=>({data:Array.from({length:Math.min(args.p_limit,1300-args.p_offset)},(_,i)=>({id:String(args.p_offset+i)}))})
assert.equal((await mod.fetchOrderSearch('old',1201)).length,1201)
globalThis.__mock.rpc=original
await unlink(file)
console.log('PASS UI: actual OrdersPage search, old results, out-of-order responses, quick clear recovery; bounded 1201-result fetching; no-assignment/nonzero/zero/team/saved-snapshot warnings; explicit zero-rate continue/cancel.')
