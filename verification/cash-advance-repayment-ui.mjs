import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/payroll'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
let remaining=500000,failAfterCommit=true;const records=[],calls=[],cash=[]
globalThis.__mock={from(table){const filters=[];let lo=0,hi=999;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},range(a,b){lo=a;hi=b;return q},then(ok){return Promise.resolve({data:(table==='v113153_cash_advance_repayments'?records:[]).filter(r=>filters.every(([k,v])=>r[k]===v)).slice(lo,hi+1),error:null}).then(ok)}};return q},async rpc(name,args){calls.push({name,args});
 if(name==='v113153_receive_cash_advance_repayment'){
  const old=records.find(r=>r.id===args.p_request_id)
  if(old)return {data:{already_recorded:true},error:null}
  records.push({id:args.p_request_id,employee_id:args.p_employee_id,amount:args.p_amount,method:args.p_method,reference:args.p_reference,note:args.p_note,created_at:'2026-10-31T07:40:00Z',cancelled_at:null});remaining-=args.p_amount;cash.push({kind:'income',method:args.p_method,amount:args.p_amount})
  if(failAfterCommit){failAfterCommit=false;throw Error('Respons jaringan hilang')}
  return {data:{new_remaining:remaining},error:null}
 }
 if(name==='v113153_cancel_cash_advance_repayment'){
  const r=records.find(r=>r.id===args.p_id);r.cancelled_at='2026-10-31T07:50:00Z';r.cancel_reason=args.p_reason;remaining+=r.amount;cash.push({kind:'expense',method:r.method,amount:r.amount});return {data:{cancelled:true},error:null}
 }
 throw Error('Unexpected salary mutation '+name)
}}
const bundle=await build({stdin:{contents:`export {PayrollDeductionCorrectionModal} from './src/components/PayrollDeductionCorrectionModal'`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mock',setup(b){b.onResolve({filter:/lib\/supabase$|\.\/supabase$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabase=globalThis.__mock'}))}}]})
const file='verification/.cash-repay-ui.mjs';await writeFile(file,bundle.outputFiles[0].text);const {PayrollDeductionCorrectionModal}=await import('./.cash-repay-ui.mjs');const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'))
function App(){const[revision,setRevision]=React.useState(0);return React.createElement(PayrollDeductionCorrectionModal,{key:revision,target:{employee:{id:'cece',full_name:'CECE'},month:'2026-10',deduction:300000,remaining,gross:1000000,paid:10000,historyOnly:true},onSaved:async()=>setRevision(r=>r+1),onClose:()=>{}})}
const click=async(text,container=document)=>{const b=[...container.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);await act(async()=>b.click())}
const input=async(selector,value)=>act(async()=>{const el=document.querySelector(selector);assert.ok(el,selector);const proto=el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
await act(async()=>root.render(React.createElement(App)))
assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Tambah Potongan Bulan 2026-10').disabled,'salary paid cannot deduct again')
assert.ok(![...document.querySelectorAll('button')].find(b=>b.textContent==='Bayar Tunai / Transfer').disabled,'cash repayment remains available after salary paid')
await click('Bayar Tunai / Transfer');await input('[aria-label="Metode Pembayaran Kasbon"]','transfer');await input('[aria-label="Nominal Pembayaran Kasbon"]','300000');assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Simpan Pembayaran Kasbon').disabled,'transfer reference required');await input('[aria-label="Referensi Pembayaran Kasbon"]','BANK-XYZ')
await click('Simpan Pembayaran Kasbon');assert.match(document.body.textContent,/Respons jaringan hilang/);assert.equal(remaining,200000)
await click('Simpan Pembayaran Kasbon');assert.equal(remaining,200000,'retry cannot subtract loan balance twice');assert.equal(calls[0].args.p_request_id,calls[1].args.p_request_id,'retry retains request key')
assert.match(document.body.textContent,/BANK-XYZ/);assert.match(document.body.textContent,/Transfer/)
await click('Bayar Tunai / Transfer');await input('[aria-label="Nominal Pembayaran Kasbon"]','100000');await click('Simpan Pembayaran Kasbon');assert.equal(remaining,100000);assert.equal(records[1].method,'cash')
const transferRow=[...document.querySelectorAll('tbody tr')].find(tr=>tr.textContent.includes('BANK-XYZ'));await click('Batalkan Pembayaran',transferRow);await input('[aria-label="Alasan Pembatalan Pembayaran"]','Salah pencatatan transfer');await click('Simpan Pembatalan Pembayaran');assert.equal(remaining,400000);assert.match(document.body.textContent,/Dibatalkan/)
assert.equal(cash.reduce((s,r)=>s+(r.kind==='income'?r.amount:-r.amount),0),100000)
assert.ok(calls.every(c=>c.name.startsWith('v113153_')),'cash/transfer never invoke salary-deduction RPC')
assert.match(document.body.textContent.replace(/[\s\u00a0]/g,''),/PotonganTercatatRp300.000/)
let blob;const create=URL.createObjectURL,revoke=URL.revokeObjectURL;URL.createObjectURL=b=>{blob=b;return 'blob:payment'};URL.revokeObjectURL=()=>{};dom.window.HTMLAnchorElement.prototype.click=function(){}
await click('XLS Pembayaran');const content=await blob.text();assert.match(content,/BANK-XYZ/);assert.match(content,/Dibatalkan/);assert.match(content,/100000/)
URL.createObjectURL=create;URL.revokeObjectURL=revoke
await act(async()=>root.unmount());await unlink(file)
console.log('PASS V153 cash repayment UI: same center; paid salary independent; cash/transfer and required reference; lost-response retry keeps idempotency key; no double loan reduction; cancellation trace/reversal; salary unchanged; real XLS includes methods, reference, cancellation and active total.')
