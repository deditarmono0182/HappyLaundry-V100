import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const b=await build({stdin:{contents:"export {ManagerShareSettings} from './src/components/ManagerShareSettings'",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'stub',setup(b){b.onResolve({filter:/lib\/supabase$/},()=>({path:'supabase',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabase={rpc(){throw new Error("No writes during render")}}'}))}}]})
const name='verification/.paid-manager-basis-ui.mjs';await writeFile(name,b.outputFiles[0].text)
try{
 const {ManagerShareSettings}=await import('./.paid-manager-basis-ui.mjs')
 const report={payroll_month:'2026-10-01',revenue:100000,operating:10000,employee_cost:50000,profit_base:40000,rows:[]}
 const render=r=>renderToStaticMarkup(React.createElement(ManagerShareSettings,{month:r.payroll_month.slice(0,7),employees:[],report:r,onSaved:async()=>{}}))
 const old=render(report);assert.match(old,/Aturan periode lama/);assert.match(old,/Order masuk/);assert.doesNotMatch(old,/Order lunas bulan ini/)
 const paid=render({...report,payroll_month:'2026-11-01',revenue_basis:'fully_paid_orders'})
 assert.match(paid,/Order lunas bulan ini/);assert.match(paid,/DP dan piutang belum dihitung/);assert.match(paid,/Tanpa cadangan/);assert.match(paid,/dasar laba nol atau minus/);assert.match(paid,/0%/)
 console.log('PASS manager UI: server-selected old/paid basis, honest revenue label, DP exclusion, expenses/payroll, reserves excluded, zero/negative share and editable percent retained.')
}finally{await unlink(name)}
