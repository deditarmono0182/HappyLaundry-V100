import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/cashier'})
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
const uid='00000000-0000-0000-0000-000000000001'
const employee={id:uid,full_name:'Haris',login_id:'haris'}
globalThis.__mutations=[];globalThis.__rateFailure=false
const rows={v100_customers:[{id:'c1',name:'Mamah Alghi',phone:'0812',address:'Jl. Babakan No. 12\nRT 01/RW 02'}],v100_services:[{id:'s1',name:'Karpet',category:'Satuan',unit:'item',price:64000,duration_hours:24,is_active:true}],v113_employee_commission_settings:[{employee_id:uid,production_percent:0,courier_percent:0}]}
globalThis.__mock={
 async rpc(name,args){
  if(name==='v113_list_commission_employees')return {data:[employee],error:null}
  globalThis.__mutations.push([name,args]);return {data:name==='v100_create_order'?{order_id:'new1',order_no:'HL-NEW'}:null,error:null}
 },
 from(table){const b={select(){return b},order(){return b},eq(){return b},gte(){return b},maybeSingle(){return b},insert(payload){globalThis.__mutations.push([table,payload]);return b},then(ok){return Promise.resolve({data:rows[table]||[],error:table==='v113_employee_commission_settings'&&globalThis.__rateFailure?{message:'offline'}:null}).then(ok)}};return b}
}
const bundle=await build({stdin:{contents:`export {CashierPage} from './src/pages/CashierPage'`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/lib\/(auth|supabase)$|\.\/supabase$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path.endsWith('auth')?`export const useAuth=()=>({profile:{id:'owner',role:'owner',full_name:'Owner'}})`:`export const supabase=globalThis.__mock`}))}}]})
const file='verification/.cashier-zero-test.mjs';await writeFile(file,bundle.outputFiles[0].text)
const {CashierPage}=await import('./.cashier-zero-test.mjs');const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {MemoryRouter}=await import('react-router-dom')
const root=createRoot(document.getElementById('root'))
await act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(CashierPage))))
const click=async(text)=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);await act(async()=>b.click())}
const choose=async(select,value)=>act(async()=>{select.value=value;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
await choose(document.querySelector('select.wide-select'),'c1')
await click('Tambah Layanan');await act(async()=>document.querySelector('button.service-picker-option').click())
const courierSelect=[...document.querySelectorAll('label')].find(l=>l.firstChild?.textContent==='Kurir').querySelector('select')
await choose(courierSelect,uid);assert.match(document.body.textContent,/masih 0%/)
let prompts=0;window.confirm=()=>{prompts++;return false}
await click('Simpan Transaksi');assert.equal(globalThis.__mutations.length,0,'cancel zero warning before order creation')
assert.equal(prompts,1)
globalThis.__rateFailure=true;await click('Simpan Transaksi');assert.equal(globalThis.__mutations.length,0,'failed rate check must not create order')
assert.match(document.body.textContent,/Tarif komisi belum dapat diperiksa/)
globalThis.__rateFailure=false;window.confirm=()=>{prompts++;return true}
await click('Simpan Transaksi')
assert.equal(globalThis.__mutations.filter(([name])=>name==='v100_create_order').length,1,'explicit zero commission allowed')
assert.equal(globalThis.__mutations.filter(([name])=>name==='v113097_set_order_commission_team').length,1)
for(const label of ['58 mm','80 mm','A4 / PDF']){
 const paper=new JSDOM('<body></body>');window.open=()=>paper.window
 await click(label);assert.match(paper.window.document.body.textContent,/Jl\. Babakan No\. 12/);assert.match(paper.window.document.body.textContent,/RT 01\/RW 02/)
}
let waUrl='';window.open=url=>{waUrl=url;return null};await click('WhatsApp')
const draftText=new URL(waUrl).searchParams.get('text');assert.match(draftText,/Karpet/);assert.match(draftText.replace(/[\s\u00a0]/g,''),/1item×Rp64\.000=Rp64\.000/)
await act(async()=>root.unmount());await unlink(file)
console.log('PASS Kasir: zero warning visible; fresh-rate failure and cancel create no order; busy released; deliberate 0% saves order/team once after confirmation.')
