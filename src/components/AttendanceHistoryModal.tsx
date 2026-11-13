import {useEffect,useMemo,useState} from 'react'
import {FileSpreadsheet,FileText,RefreshCw} from 'lucide-react'
import {Modal} from './Modal'
import {attendanceMonthDays,loadAttendanceMonth,loadAttendanceAudit,historySource,type HistoryAttendance,type HistoryAttendanceStatus,type AttendanceAudit} from '../lib/attendanceHistory'
import {BUSINESS_TIME_ZONE,businessMonthKey} from '../lib/businessTime'
import {downloadXls,printPdf} from '../lib/exportData'
const labels={present:'Hadir',permission:'Izin',sick:'Sakit',absent:'Alpa'}
const dateLabel=(date:string)=>new Intl.DateTimeFormat('id-ID',{timeZone:BUSINESS_TIME_ZONE,weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date(`${date}T12:00:00+07:00`))
const timeLabel=(value:string|null|undefined)=>value?new Intl.DateTimeFormat('id-ID',{timeZone:BUSINESS_TIME_ZONE,hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'-'
export function AttendanceHistoryModal({employee,initialMonth,onClose,onCorrect}:{
 employee:{id:string;full_name:string;login_id:string};initialMonth:string;onClose:()=>void;
 onCorrect:(dates:string[],status:HistoryAttendanceStatus)=>void
}){
 const [month,setMonth]=useState(initialMonth)
 const [records,setRecords]=useState<HistoryAttendance[]>([])
 const [audit,setAudit]=useState<AttendanceAudit[]>([])
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[auditError,setAuditError]=useState('')
 const [onlyMissing,setOnlyMissing]=useState(false),[revision,setRevision]=useState(0)
 const [pickedDates,setPickedDates]=useState<string[]>([]),[pickStatus,setPickStatus]=useState<HistoryAttendanceStatus>('present')
 useEffect(()=>{
  let active=true;setLoading(true);setError('');setAuditError('');setRecords([]);setAudit([]);setPickedDates([])
  void(async()=>{
   const [daily,history]=await Promise.allSettled([loadAttendanceMonth(employee.id,month),loadAttendanceAudit(employee.id,month)])
   if(!active)return
   if(daily.status==='fulfilled')setRecords(daily.value);else setError(daily.reason instanceof Error?daily.reason.message:'Riwayat hadir gagal dimuat.')
   if(history.status==='fulfilled')setAudit(history.value);else setAuditError(history.reason instanceof Error?history.reason.message:'Riwayat koreksi gagal dimuat.')
   setLoading(false)
  })()
  return()=>{active=false}
 },[employee.id,month,revision])
 const days=useMemo(()=>month?attendanceMonthDays(month,records):[],[month,records])
 const visible=onlyMissing?days.filter(row=>!row.record):days
 const counts={present:0,permission:0,sick:0,absent:0,missing:0}
 for(const day of days){if(day.record)counts[day.record.status]++;else counts.missing++}
 const canUse=!loading&&!error&&!!month
 const togglePick=(date:string,status?:HistoryAttendanceStatus)=>setPickedDates((current:string[])=>{
  if(current.includes(date))return current.filter((item:string)=>item!==date)
  if(current.length===0)setPickStatus(status||'present')
  return [...current,date]
 })
 const options=()=>({title:`Riwayat Kehadiran — ${employee.full_name}`,filename:`riwayat-hadir-${employee.login_id}-${month}`,
  subtitle:`Periode ${month} • Waktu WIB • Belum Absen berarti belum ada catatan; bukan bukti tidak bekerja.`,
  headers:['Tanggal','Status','Masuk (WIB)','Pulang (WIB)','Sumber','Alasan / Catatan'],
  rows:visible.map(({date,record})=>[date,record?labels[record.status]:'Belum Absen',record?.attendance_source==='owner_override'?'-':timeLabel(record?.check_in_at),record?.attendance_source==='owner_override'?'-':timeLabel(record?.check_out_at),historySource(record?.attendance_source),record?.override_reason||record?.note||'-']),
  summary:[['Hadir',counts.present],['Izin',counts.permission],['Sakit',counts.sick],['Alpa',counts.absent],['Belum Absen',counts.missing]] as Array<[string,number]>
 })
 return <Modal title={`Riwayat Kehadiran — ${employee.full_name}`} onClose={onClose} className="attendance-history-modal">
  <div className="modal-form">
   <div className="info-box attendance-history-info">Pilih satu atau beberapa tanggal yang terlewat, lalu koreksi statusnya sekaligus. Belum Absen bisa berarti libur atau belum bekerja; tanggal mendatang tidak ditandai absen.</div>
   <div className="attendance-history-tools">
    <label>Bulan Riwayat<input type="month" value={month} max={businessMonthKey()} onChange={e=>{if(e.target.value)setMonth(e.target.value)}}/></label>
    <label className="checkbox-label"><input type="checkbox" checked={onlyMissing} onChange={e=>setOnlyMissing(e.target.checked)}/>Hanya Belum Absen</label>
    <button type="button" className="secondary-button" onClick={()=>setRevision(v=>v+1)} disabled={loading}><RefreshCw size={15}/>Muat Ulang</button>
    <button type="button" className="secondary-button" disabled={!canUse} onClick={()=>downloadXls(options())}><FileSpreadsheet size={15}/>XLS</button>
    <button type="button" className="secondary-button" disabled={!canUse} onClick={()=>printPdf(options())}><FileText size={15}/>PDF</button>
   </div>
   {loading?<div className="info-box">Memuat riwayat kehadiran...</div>:error?<div className="error-box">{error}. Coba Muat Ulang; tanggal yang belum dimuat tidak dianggap Belum Absen.</div>:<>
    <div className="attendance-history-counts">{(['present','permission','sick','absent','missing'] as const).map(key=><div key={key}><span>{key==='missing'?'Belum Absen':labels[key]}</span><b>{counts[key]}</b></div>)}</div>
    <div className="attendance-correct-bar" role="group" aria-label="Koreksi kehadiran tanggal terpilih">
     <span className="attendance-correct-info">{pickedDates.length?<>Dipilih <b>{pickedDates.length} tanggal</b>{pickedDates.length<=4&&<>: {[...pickedDates].sort().map(d=>dateLabel(d)).join('; ')}</>}</>:'Klik satu atau beberapa tanggal di bawah untuk dikoreksi sekaligus.'}</span>
     <span className="attendance-correct-controls">
      <button type="button" className="secondary-button attendance-select-missing" onClick={()=>setPickedDates(days.filter((day:{date:string;record?:unknown})=>!day.record).map((day:{date:string})=>day.date))} disabled={!days.some((day:{date:string;record?:unknown})=>!day.record)}>Pilih semua Belum Absen</button>
      <button type="button" className="secondary-button" onClick={()=>setPickedDates([])} disabled={!pickedDates.length}>Kosongkan</button>
      <select aria-label="Status koreksi" disabled={!pickedDates.length} value={pickStatus} onChange={e=>setPickStatus(e.target.value as HistoryAttendanceStatus)}>{Object.entries(labels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>
      <button type="button" className="secondary-button attendance-apply" disabled={!pickedDates.length} onClick={()=>onCorrect(pickedDates,pickStatus)}>Koreksi{pickedDates.length>1?` (${pickedDates.length})`:''}</button>
     </span>
    </div>
    <div className="table-wrap attendance-history-scroll attendance-history-main"><table>
     <thead><tr><th aria-label="Pilih"></th><th>Tanggal (WIB)</th><th>Status</th><th>Masuk</th><th>Pulang</th><th>Sumber / Catatan</th></tr></thead>
     <tbody>{visible.map(({date,record})=><tr key={date} data-attendance-date={date} className={pickedDates.includes(date)?'is-picked':''} tabIndex={0} role="checkbox" aria-checked={pickedDates.includes(date)}
      onClick={()=>togglePick(date,record?.status)}
      onKeyDown={(e:{key:string;preventDefault:()=>void})=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();togglePick(date,record?.status)}}}>
      <td className="attendance-pick"><span className="pl-check" aria-hidden="true"/></td><td>{dateLabel(date)}</td><td><span className={`attendance-badge attendance-${record?.status||'none'}`}>{record?labels[record.status]:'Belum Absen'}</span></td>
      <td>{record?.attendance_source==='owner_override'?'-':timeLabel(record?.check_in_at)}</td><td>{record?.attendance_source==='owner_override'?'-':timeLabel(record?.check_out_at)}</td>
      <td className="attendance-history-note">{historySource(record?.attendance_source)}{record?.attendance_source==='owner_override'&&<small>Jam kerja tidak ditentukan dari waktu koreksi.</small>}<small>{record?.override_reason||record?.note||'-'}</small></td>
     </tr>)}{visible.length===0&&<tr><td colSpan={6} className="table-empty">{onlyMissing?'Tidak ada tanggal tanpa catatan pada periode ini.':'Belum ada tanggal yang sudah berjalan pada bulan ini.'}</td></tr>}</tbody>
    </table></div>
   </>}
   <div className="section-title"><b>Riwayat Koreksi Manual Owner</b><small>Tanggal absensi dan waktu perubahan dicatat terpisah.</small></div>
   {loading?<small>Memuat...</small>:auditError?<div className="error-box">Audit koreksi belum dapat dibaca: {auditError}</div>:<div className="table-wrap attendance-history-scroll"><table>
    <thead><tr><th>Tanggal Absensi</th><th>Waktu Koreksi (WIB)</th><th>Keterangan</th></tr></thead><tbody>{audit.map(item=><tr key={item.id}><td>{item.entity_id}</td><td>{new Intl.DateTimeFormat('id-ID',{timeZone:BUSINESS_TIME_ZONE,dateStyle:'medium',timeStyle:'short'}).format(new Date(item.created_at))}</td><td className="attendance-history-note">{item.details||'-'}</td></tr>)}{audit.length===0&&<tr><td colSpan={3} className="table-empty">Belum ada koreksi manual tercatat untuk periode ini.</td></tr>}</tbody>
   </table></div>}
  </div>
 </Modal>
}
