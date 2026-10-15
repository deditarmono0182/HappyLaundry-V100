import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>')
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
globalThis.__limits=[{employee_id:'a',salary_available:1500000,outstanding:1000000,payroll_month:'2026-10-01'},{employee_id:'b',salary_available:100000,outstanding:0,payroll_month:'2026-10-01'}]
const r=await build({stdin:{contents:`import {CashAdvanceWarning} from './src/components/CashAdvanceWarning';import {cashAdvanceBlocked,useCashAdvanceLimit} from './src/lib/cashAdvanceLimit';export function Harness({employee='a',owner=false,amount=800000,reason=''}){const state=useCashAdvanceLimit(employee,true);return <><CashAdvanceWarning state={state} amount={amount} owner={owner} reason={reason} onReason={()=>{}} onRefresh={state.refresh}/><button disabled={cashAdvanceBlocked(state,amount,owner,reason)}>Save</button></>}`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mock-db',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'db',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const supabase={rpc:async(name,args)=>{if(globalThis.__failure)throw new Error('Connection failed');if(globalThis.__pending)await globalThis.__pending;return {data:globalThis.__limits.filter(l=>l.employee_id===args.p_employee_id),error:null}}}` }))}}]})
await writeFile('verification/.warning-test-bundle.mjs',r.outputFiles[0].text)
const {Harness}=await import('./.warning-test-bundle.mjs');const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'))
const render=async(props)=>{await act(async()=>root.render(React.createElement(Harness,props)))}
const save=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Save')
await render({});assert.equal(save().disabled,true);assert.match(document.body.textContent,/300.000/);assert.match(document.body.textContent,/Pengajuan diblokir/);assert.equal(document.querySelectorAll('textarea').length,0)
await render({owner:true});assert.equal(save().disabled,true);assert.ok(document.querySelector('textarea'))
await render({owner:true,reason:'ok'});assert.equal(save().disabled,true)
await render({owner:true,reason:'Darurat keluarga'});assert.equal(save().disabled,false)
await render({owner:false,amount:500000});assert.equal(save().disabled,false,'exact boundary')
let resolve;globalThis.__pending=new Promise(r=>resolve=r)
await render({employee:'b',amount:1});assert.equal(save().disabled,true,'no stale employee balance while loading')
resolve();globalThis.__pending=null;await act(async()=>{});assert.equal(save().disabled,false)
globalThis.__failure=true;await render({employee:'a',owner:true,reason:'Darurat keluarga'});assert.equal(save().disabled,true);assert.match(document.body.textContent,/Connection failed/)
await act(async()=>root.unmount());await unlink('verification/.warning-test-bundle.mjs')
console.log('PASS: visible excess, finance block, owner reason, short reason rejection, exact boundary, stale selection protection, network failure blocks save.')
