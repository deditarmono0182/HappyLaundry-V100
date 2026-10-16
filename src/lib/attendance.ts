import {supabase} from './supabase'
import {withTimeout} from './network'
export type AttendanceState={attendance_date?:string;attendance_required?:boolean;attended_today?:boolean;checked_out?:boolean;within_work_hours?:boolean;work_start?:string;work_end?:string;check_in_at?:string|null;check_out_at?:string|null;employee?:boolean;session_valid?:boolean}
export type AttendanceResult={ok?:boolean;created?:boolean;status?:string;distance_meters?:number;attendance_date?:string;check_in_at?:string;check_out_at?:string;action?:'check_in'|'check_out'|'already_checked_in'|'already_done'|'exempt';message?:string}
export function attendanceError(error:unknown){
 const e=error as {code?:unknown;message?:unknown}|null
 // Some browsers expose a GPS error object without a global constructor.
 if(typeof e?.code==='number'&&e.code===1)return 'Izin Location/GPS ditolak. Aktifkan Location untuk HappyLaundry lalu coba lagi.'
 if(typeof e?.code==='number'&&(e.code===2||e.code===3))return 'Lokasi GPS belum dapat dibaca. Pastikan Location aktif, lalu coba lagi.'
 const message=String(e?.message||error||'Absensi belum berhasil. Silakan coba lagi.')
 if(message.includes('v111_attendance_source_check'))return 'Aturan absensi GPS di database belum diperbarui. Minta Owner menjalankan SQL 075 atau 076.'
 if(/failed to fetch|network|load failed|fetch/i.test(message))return 'Koneksi ke server terputus. Tekan Periksa Status sebelum mencoba absen lagi.'
 return message
}
export const attendanceEventAction=(r:AttendanceResult)=>r.action==='already_done'||r.action==='check_out'?'check_out':r.action==='check_in'||r.action==='already_checked_in'?'check_in':undefined
const location=()=>new Promise<GeolocationPosition>((resolve,reject)=>{
 if(!navigator.geolocation){reject(new Error('GPS tidak tersedia di perangkat ini.'));return}
 navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0})
})
export async function loadAttendanceState(){
 const {data,error}=await withTimeout(supabase.rpc('v11322_current_attendance_state'),15000,'Pemeriksaan status absensi')
 if(error)throw error
 const row=(Array.isArray(data)?data[0]:data) as AttendanceState|null
 if(!row||typeof row.attendance_required!=='boolean')throw new Error('Status absensi belum dapat dipastikan. Tekan Periksa Status.')
 if(row.session_valid===false||row.employee===false)throw new Error('Sesi karyawan tidak valid. Silakan login ulang.')
 return row
}
const pending=new Map<string,Promise<{result:AttendanceResult;position:GeolocationPosition}>>()
export function recordEmployeeAttendance(employeeId:string,action:'check_in'|'check_out'){
 const key=employeeId+':'+action
 const existing=pending.get(key);if(existing)return existing
 const task=(async()=>{
  const position=await withTimeout(location(),17000,'Pembacaan GPS')
  const ua=navigator.userAgent||''
  const device=/iPhone/i.test(ua)?'iPhone':/iPad/i.test(ua)?'iPad':/Android/i.test(ua)?'Android':/Windows/i.test(ua)?'Windows':/Macintosh/i.test(ua)?'Mac':'Browser'
  const {data,error}=await withTimeout(supabase.rpc('v113070_record_gps_attendance',{p_action:action,p_latitude:position.coords.latitude,p_longitude:position.coords.longitude,p_accuracy_meters:position.coords.accuracy,p_device:device}),20000,'Penyimpanan absensi; status belum dipastikan. Tekan Periksa Status')
  if(error)throw error
  const result=(Array.isArray(data)?data[0]:data) as AttendanceResult|null
  if(!result?.ok)throw new Error(result?.message||'Absensi belum berhasil. Tekan Periksa Status.')
  return {result,position}
 })()
 pending.set(key,task)
 void task.finally(()=>{if(pending.get(key)===task)pending.delete(key)}).catch(()=>{})
 return task
}
