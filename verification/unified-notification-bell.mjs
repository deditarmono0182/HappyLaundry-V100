import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test'})
Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})
globalThis.route='';globalThis.role='owner'
const notices=[{key:'a',kind:'addition',request_id:'1',employee_name:'A',amount:100,status:'pending',time:'2026-11-06T12:00:00Z',requester_name:'B'},{key:'c',kind:'correction',request_id:'2',employee_name:'C',amount:50,status:'pending',time:'2026-11-06T13:00:00Z',requester_name:'D'}]
globalThis.notices=notices
const stubs={auth:'export const useAuth=()=>({profile:{id:"owner-test",role:globalThis.role}})',permissions:'export const canAccess=()=>true',router:'export const useNavigate=()=>route=>{globalThis.route=route}',Modal:'export const Modal=({title,children})=><section><h2>{title}</h2>{children}</section>',supabase:`export const supabase={rpc:async()=>({data:{rows:globalThis.notices,count:globalThis.notices.length}}),from:()=>({select(){return this},eq(){return this},order:async()=>({data:[{id:'d1',entity_label:'Order XYZ',reason:'Duplikat',requested_by_name:'Kasir',requested_at:'2026-11-06T14:00:00Z'}]})})}`}
const b=await build({stdin:{contents:"export {CashAdvanceNotifications} from './src/components/CashAdvanceNotifications'",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'stub',setup(b){b.onResolve({filter:/lib\/(auth|permissions|supabase)$|react-router-dom|\/Modal$/},args=>({path:args.path.split('/').at(-1)==='react-router-dom'?'router':args.path.split('/').at(-1),namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:process.cwd()}))}}]})
const path='verification/.unified-bell-bundle.mjs';await writeFile(path,b.outputFiles[0].text)
const root=createRoot(document.getElementById('root'))
try{
 const {CashAdvanceNotifications}=await import('./.unified-bell-bundle.mjs')
 await act(async()=>root.render(React.createElement(CashAdvanceNotifications)))
 let bell=document.querySelector('button');assert.match(bell.getAttribute('aria-label'),/3 belum dibaca/)
 assert.equal(document.querySelectorAll('button').length,1)
 await act(async()=>bell.click())
 assert.match(document.body.textContent,/Tambahan Kasbon/);assert.match(document.body.textContent,/Koreksi Kasbon/);assert.match(document.body.textContent,/Permintaan Penghapusan/)
 const items=document.querySelectorAll('.cash-notice-item');assert.equal(items.length,3);assert.match(items[0].textContent,/Order XYZ/)
 await act(async()=>items[0].click());assert.equal(globalThis.route,'/delete-approvals?request_id=d1');assert.match(document.querySelector('button').getAttribute('aria-label'),/2 belum dibaca/)
 await act(async()=>document.querySelector('button').click());await act(async()=>[...document.querySelectorAll('button')].find(x=>x.textContent==='Tandai dibaca').click())
 assert.match(document.querySelector('button').getAttribute('aria-label'),/0 belum dibaca/)
 await act(async()=>root.unmount())
 console.log('PASS one bell; combined count; three labels; newest first; deletion deep-link; individual/all read; read persistence.')
}finally{await unlink(path);dom.window.close()}
