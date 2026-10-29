import {supabase} from './supabase'
import {businessDateKey} from './businessTime'
export type HistoryAttendanceStatus='present'|'permission'|'sick'|'absent'
export type HistoryAttendance={id:string;employee_id:string;attendance_date:string;status:HistoryAttendanceStatus;attendance_source?:string|null;check_in_at?:string|null;check_out_at?:string|null;note?:string|null;override_reason?:string|null;overridden_at?:string|null}
export type AttendanceAudit={id:string;entity_id:string;details:string|null;created_at:string}
export function attendanceMonthRange(month:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Bulan tidak valid.')
 const [year,m]=month.split('-').map(Number)
 const days=new Date(Date.UTC(year,m,0)).getUTCDate()
 return {start:`${month}-01`,end:`${month}-${String(days).padStart(2,'0')}`,days}
}
export function attendanceMonthDays(month:string,records:HistoryAttendance[],today=businessDateKey()){
 const {days}=attendanceMonthRange(month)
 const byDate=new Map(records.map(row=>[row.attendance_date,row]))
 return Array.from({length:days},(_,i)=>{
  const date=`${month}-${String(i+1).padStart(2,'0')}`
  return {date,record:byDate.get(date)||null}
 }).filter(row=>row.date<=today)
}
export async function loadAttendanceMonth(employeeId:string,month:string){
 const {start,end}=attendanceMonthRange(month)
 const {data,error}=await supabase.from('v111_attendance').select('*').eq('employee_id',employeeId)
   .gte('attendance_date',start).lte('attendance_date',end).order('attendance_date')
 if(error)throw new Error(error.message)
 return (data||[]) as HistoryAttendance[]
}
export async function loadAttendanceAudit(employeeId:string,month:string){
 const {start,end}=attendanceMonthRange(month),result:AttendanceAudit[]=[]
 for(let offset=0;;offset+=100){
  const {data,error}=await supabase.from('v109_audit_log').select('id,entity_id,details,created_at')
    .eq('employee_id',employeeId).eq('action','OWNER_ATTENDANCE_OVERRIDE').eq('entity_type','attendance')
    .gte('entity_id',start).lte('entity_id',end).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+99)
  if(error)throw new Error(error.message)
  const page=(data||[]) as AttendanceAudit[];result.push(...page)
  if(page.length<100)break
 }
 return result
}
export const historySource=(source:string|null|undefined)=>source==='owner_override'?'Manual Owner':source==='login_gps'?'GPS saat login':source==='qr_gps'?'QR + GPS':source==='login'?'Login':source==='manual'?'Manual':source||'-'
