import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFile,unlink} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/attendance'})
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.CustomEvent=dom.window.CustomEvent;globalThis.IS_REACT_ACT_ENVIRONMENT=true
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
let gpsCalls=0
Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){gpsCalls++;if(globalThis.__gpsError)fail({code:1,message:'denied'});else ok({coords:{latitude:-6.7,longitude:108.5,accuracy:29}})}}})
globalThis.__state={attendance_required:true,attended_today:false,checked_out:false,session_valid:true,employee:true}
globalThis.__records=0
const bundle=await build({stdin:{contents:`export {AttendancePage} from './src/pages/AttendancePage';export * from './src/lib/attendance'`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/lib\/(auth|supabase)$|\.\/supabase$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path.endsWith('auth')?`export const useAuth=()=>({profile:{id:'employee1',role:'employee',full_name:'Robet',login_id:'robet'}})`:`export const supabase={rpc:async(name,args)=>{
 if(name==='v11322_current_attendance_state'){if(globalThis.__stateError)return {error:{message:'State unavailable'}};return {data:globalThis.__state}}
 globalThis.__records++;if(globalThis.__pending)await globalThis.__pending;
 if(globalThis.__recordError)throw new Error('Failed to fetch');
 const action=globalThis.__alreadyDone?'already_done':args.p_action;
 globalThis.__state={...globalThis.__state,attended_today:true,checked_out:action==='check_out'||action==='already_done'};
 return {data:{ok:true,action,check_in_at:'2026-10-16T01:00:00Z',distance_meters:0}}
}}`}))}}]})
await writeFile('verification/.attendance-test-bundle.mjs',bundle.outputFiles[0].text)
const module=await import('./.attendance-test-bundle.mjs');const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {MemoryRouter,useLocation}=await import('react-router-dom')
let path;function Location(){path=useLocation().pathname;return null}
const root=createRoot(document.getElementById('root'));let revision=0
const mount=async()=>{await act(async()=>root.render(React.createElement(MemoryRouter,{key:++revision,initialEntries:['/attendance']},React.createElement(module.AttendancePage),React.createElement(Location))))}
const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent===label)
const click=async(label)=>{assert.ok(button(label),label);await act(async()=>button(label).click())}
await mount();assert.equal(button('ABSEN MASUK').disabled,false)
globalThis.__gpsError=true;await click('ABSEN MASUK');assert.match(document.body.textContent,/Izin Location\/GPS ditolak/);assert.equal(button('ABSEN MASUK').disabled,false,'GPS failure releases busy without constructor ReferenceError')
globalThis.__gpsError=false;globalThis.__recordError=true;await click('ABSEN MASUK');assert.match(document.body.textContent,/Koneksi ke server terputus/);assert.equal(button('ABSEN MASUK').disabled,false,'network failure releases busy')
globalThis.__recordError=false;globalThis.__stateError=true;await click('Periksa Status');assert.ok(button('ABSEN MASUK').disabled);assert.match(document.body.textContent,/State unavailable/)
globalThis.__stateError=false;await click('Periksa Status');assert.equal(button('ABSEN MASUK').disabled,false)
let release;globalThis.__pending=new Promise(r=>release=r)
const before=globalThis.__records,oldGps=gpsCalls
await act(async()=>{button('ABSEN MASUK').click();button('ABSEN MASUK').click()})
assert.equal(globalThis.__records,before+1);assert.equal(gpsCalls,oldGps+1)
release();globalThis.__pending=null;await act(async()=>{});assert.equal(path,'/')
await mount();assert.ok(button('ABSEN PULANG'));await click('ABSEN PULANG');assert.match(document.body.textContent,/Absensi Hari Ini Selesai/);assert.ok(!button('ABSEN MASUK'))
// Lost response / second device reporting an already completed day must not reopen work.
globalThis.__state={...globalThis.__state,attended_today:false,checked_out:false};globalThis.__alreadyDone=true
let eventAction;const listen=e=>eventAction=e.detail.action;window.addEventListener('happylaundry-attendance-changed',listen)
await mount();await click('ABSEN MASUK');assert.equal(eventAction,'check_out');assert.equal(path,'/attendance')
window.removeEventListener('happylaundry-attendance-changed',listen)
// Automatic + manual calls share the same request for the same employee/action.
globalThis.__alreadyDone=false;globalThis.__pending=new Promise(r=>release=r)
const count=globalThis.__records;const p1=module.recordEmployeeAttendance('employee2','check_in'),p2=module.recordEmployeeAttendance('employee2','check_in');assert.equal(p1,p2)
release();globalThis.__pending=null;await Promise.all([p1,p2]);assert.equal(globalThis.__records,count+1)
globalThis.__state={attendance_required:false,session_valid:false,employee:false};await assert.rejects(()=>module.loadAttendanceState(),/Sesi karyawan tidak valid/)
assert.match(module.attendanceError({message:'violates v111_attendance_source_check'}),/SQL 075 atau 076/)
await act(async()=>root.unmount());await unlink('verification/.attendance-test-bundle.mjs')
console.log('PASS UI: denied GPS without global constructor; network recovery; failed state blocks mutation; status retry; double tap; checkout; completed day; auto/manual request sharing; invalid session is not exempt.')
