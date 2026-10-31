import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/payroll'})
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
const id='robet',statusDays=[['2026-10-02','present'],['2026-10-03','sick'],['2026-10-04','permission'],['2026-10-05','absent'],['2026-09-30','present']]
const dataset={v109_users:[{id,full_name:'HAJI ROBET',login_id:'robet',is_active:true}],v111_employee_payroll_settings:[{employee_id:id,attendance_rate:10000,monthly_allowance:0}],v111_attendance:statusDays.map(([date,status])=>({id:date,employee_id:id,attendance_date:date,status,attendance_source:'login_gps',check_in_at:date+'T01:00:00Z'})),v109_audit_log:[]}
let failDaily=false,failSave=false,mutations=0,resolveSave,pendingSave
const calls=[]
globalThis.__mock={from(table){const filters=[];let start=0,end=999;const q={select(){return q},eq(k,v){filters.push([k,'eq',v]);return q},gte(k,v){filters.push([k,'gte',v]);return q},lte(k,v){filters.push([k,'lte',v]);return q},order(){return q},range(a,b){start=a;end=b;return q},then(ok){calls.push([table,filters]);const data=(dataset[table]||[]).filter(r=>filters.every(([k,op,v])=>op==='eq'?r[k]===v:op==='gte'?r[k]>=v:r[k]<=v)).slice(start,end+1);return Promise.resolve({data,error:failDaily&&table==='v111_attendance'?{message:'Koneksi absensi gagal'}:null}).then(ok)}};return q},async rpc(name,args){if(name==='v113151_manager_report')return {data:{rows:[],profit_base:0},error:null};assert.equal(name,'v111_owner_override_attendance');mutations++;if(pendingSave)await pendingSave;if(failSave)throw new Error('Jaringan putus');
 const row={id:args.p_attendance_date,employee_id:args.p_employee_id,attendance_date:args.p_attendance_date,status:args.p_status,attendance_source:'owner_override',override_reason:args.p_reason,check_in_at:'2026-10-29T07:00:00Z'};
 const old=dataset.v111_attendance.findIndex(r=>r.employee_id===row.employee_id&&r.attendance_date===row.attendance_date);if(old>=0)dataset.v111_attendance[old]=row;else dataset.v111_attendance.push(row)
 dataset.v109_audit_log.push({id:String(mutations),employee_id:args.p_employee_id,entity_id:args.p_attendance_date,action:'OWNER_ATTENDANCE_OVERRIDE',entity_type:'attendance',details:args.p_reason,created_at:'2026-10-29T07:00:00Z'})
 return {data:{message:'Absensi berhasil disimpan'},error:null}
}}
const bundle=await build({stdin:{contents:`export {PayrollPage} from './src/pages/PayrollPage';export * from './src/lib/attendanceHistory'`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mock',setup(b){b.onResolve({filter:/lib\/supabase$|\.\/supabase$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabase=globalThis.__mock'}))}}]})
const file='verification/.attendance-history-test.mjs';await writeFile(file,bundle.outputFiles[0].text)
const mod=await import('./.attendance-history-test.mjs');const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {MemoryRouter}=await import('react-router-dom')
assert.equal(mod.attendanceMonthDays('2024-02',[],'2024-03-01').length,29)
assert.equal(mod.attendanceMonthDays('2026-10',[],'2026-10-03').length,3,'future days excluded')
assert.equal(mod.attendanceMonthDays('2026-11',[],'2026-10-29').length,0)
const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(mod.PayrollPage))))
const click=async(label)=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(b,label);await act(async()=>b.click())}
const setValue=async(input,value)=>act(async()=>{const proto=input.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
await setValue(document.querySelector('input[type="month"]'),'2026-10');await click('Riwayat Hadir')
const tableRow=date=>document.querySelector(`tr[data-attendance-date="${date}"]`)
assert.match(tableRow('2026-10-01').textContent,/Belum Absen/)
assert.match(tableRow('2026-10-03').textContent,/Sakit/);assert.match(tableRow('2026-10-04').textContent,/Izin/);assert.match(tableRow('2026-10-05').textContent,/Alpa/)
await act(async()=>document.querySelector('.attendance-history-tools input[type="checkbox"]').click())
assert.ok(tableRow('2026-10-01'));assert.equal(tableRow('2026-10-03'),null,'sick is not missing attendance')
await setValue(document.querySelector('.attendance-history-tools input[type="month"]'),'2026-09')
assert.ok(tableRow('2026-09-29'));await act(async()=>tableRow('2026-09-29').querySelector('button').click())
assert.match(document.querySelector('[role="dialog"]').textContent,/29 September 2026/,'correction uses historical row date')
await setValue(document.querySelector('textarea'),'Karyawan hadir, tetapi lupa absen.')
failSave=true;await click('Simpan Absensi Manual');assert.match(document.querySelector('[role="dialog"]').textContent,/Jaringan putus/);assert.equal(document.querySelector('button.primary-button').disabled,false)
failSave=false;pendingSave=new Promise(r=>resolveSave=r)
await act(async()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Simpan Absensi Manual');button.click();button.click()})
assert.equal(mutations,2,'one failed attempt + one in-flight attempt despite double tap')
resolveSave();pendingSave=null;await act(async()=>{})
assert.ok(document.querySelector('.attendance-history-modal'))
// Missing-only is reset after returning; corrected date shows Hadir and no invented shift time.
assert.match(tableRow('2026-09-29').textContent,/Hadir/);assert.match(tableRow('2026-09-29').textContent,/Manual Owner/);assert.doesNotMatch(tableRow('2026-09-29').textContent,/14:00/)
assert.match(document.querySelector('.attendance-history-modal').textContent,/Karyawan hadir, tetapi lupa absen/)
assert.ok(calls.some(([table,filters])=>table==='v109_audit_log'&&filters.some(([k,op,v])=>k==='entity_id'&&op==='gte'&&v==='2026-09-01')),'history filters attendance date, not modification date')
await act(async()=>document.querySelector('.attendance-history-modal button[aria-label="Tutup"]').click());await click('Daftar Gaji');await click('Detail')
assert.match(document.querySelector('.payroll-detail-summary').textContent,/Uang Kehadiran \(2 hari\)/);assert.match(document.querySelector('.payroll-detail-summary').textContent.replace(/[\s\u00a0]/g,''),/Rp20\.000/)
await act(async()=>document.querySelector('.modal-backdrop button[aria-label="Tutup"]').click());await click('Riwayat Hadir')
failDaily=true;await click('Muat Ulang');assert.match(document.querySelector('.attendance-history-modal').textContent,/Koneksi absensi gagal/);assert.equal(document.querySelectorAll('tr[data-attendance-date]').length,0,'failed read does not mark all days missing')
failDaily=false;await click('Muat Ulang');assert.ok(tableRow('2026-09-29'))
await act(async()=>root.unmount());await unlink(file)
console.log('PASS V150: monthly dates/leap year/WIB cutoff; missing vs leave/sick/absent; historical month correction; exact target date; network retry/double tap; audit by attendance date; manual clock not fabricated; paid attendance and wages updated; data-read failure safely recovers.')
