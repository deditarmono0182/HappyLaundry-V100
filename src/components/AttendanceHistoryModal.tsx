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
 onCorrect:(date:string,status:HistoryAttendanceStatus)=>void
}){
 const [month,setMonth]=useState(initialMonth)
 const [records,setRecords]=useState<HistoryAttendance[]>([])
 const [audit,setAudit]=useState<AttendanceAudit[]>([])
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[auditError,setAuditError]=useState('')
 const [onlyMissing,setOnlyMissing]=useState(false),[revision,setRevision]=useState(0)
 const [selected,setSelected]=useState<Record<string,HistoryAttendanceStatus>>({})
 useEffect(()=>{
  let active=true;setLoading(true);setError('');setAuditError('');setRecords([]);setAudit([]);setSelected({})
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
 const options=()=>({title:`Riwayat Kehadiran — ${employee.full_name}`,filename:`riwayat-hadir-${employee.login_id}-${month}`,
  subtitle:`Periode ${month} • Waktu WIB • Belum Absen berarti belum ada catatan; bukan bukti tidak bekerja.`,
  headers:['Tanggal','Status','Masuk (WIB)','Pulang (WIB)','Sumber','Alasan / Catatan'],
  rows:visible.map(({date,record})=>[date,record?labels[record.status]:'Belum Absen',record?.attendance_source==='owner_override'?'-':timeLabel(record?.check_in_at),record?.attendance_source==='owner_override'?'-':timeLabel(record?.check_out_at),historySource(record?.attendance_source),record?.override_reason||record?.note||'-']),
  summary:[['Hadir',counts.present],['Izin',counts.permission],['Sakit',counts.sick],['Alpa',counts.absent],['Belum Absen',counts.missing]] as Array<[string,number]>
 })
 return <Modal title={`Riwayat Kehadiran — ${employee.full_name}`} onClose={onClose} className="attendance-history-modal">
  <div className="modal-form">
   <div className="info-box">Cari tanggal yang terlewat, cocokkan dengan bukti kerja atau keterangan karyawan, lalu koreksi statusnya. Belum Absen juga dapat berarti libur atau belum bekerja. Tanggal mendatang tidak ditandai sebagai absen.</div>
   <div className="attendance-history-tools">
    <label>Bulan Riwayat<input type="month" value={month} max={businessMonthKey()} onChange={e=>{if(e.target.value)setMonth(e.target.value)}}/></label>
    <label className="checkbox-label"><input type="checkbox" checked={onlyMissing} onChange={e=>setOnlyMissing(e.target.checked)}/>Hanya Belum Absen</label>
    <button type="button" className="secondary-button" onClick={()=>setRevision(v=>v+1)} disabled={loading}><RefreshCw size={15}/>Muat Ulang</button>
    <button type="button" className="secondary-button" disabled={!canUse} onClick={()=>downloadXls(options())}><FileSpreadsheet size={15}/>XLS</button>
    <button type="button" className="secondary-button" disabled={!canUse} onClick={()=>printPdf(options())}><FileText size={15}/>PDF</button>
   </div>
   {loading?<div className="info-box">Memuat riwayat kehadiran...</div>:error?<div className="error-box">{error}. Coba Muat Ulang; tanggal yang belum dimuat tidak dianggap Belum Absen.</div>:<>
    <div className="attendance-history-counts">{(['present','permission','sick','absent','missing'] as const).map(key=><div key={key}><span>{key==='missing'?'Belum Absen':labels[key]}</span><b>{counts[key]}</b></div>)}</div>
    <div className="table-wrap attendance-history-scroll"><table>
     <thead><tr><th>Tanggal (WIB)</th><th>Status</th><th>Masuk</th><th>Pulang</th><th>Sumber / Catatan</th><th>Koreksi Owner</th></tr></thead>
     <tbody>{visible.map(({date,record})=><tr key={date} data-attendance-date={date}>
      <td>{dateLabel(date)}</td><td><span className={`attendance-badge attendance-${record?.status||'none'}`}>{record?labels[record.status]:'Belum Absen'}</span></td>
      <td>{record?.attendance_source==='owner_override'?'-':timeLabel(record?.check_in_at)}</td><td>{record?.attendance_source==='owner_override'?'-':timeLabel(record?.check_out_at)}</td>
      <td className="attendance-history-note">{historySource(record?.attendance_source)}{record?.attendance_source==='owner_override'&&<small>Jam kerja tidak ditentukan dari waktu koreksi.</small>}<small>{record?.override_reason||record?.note||'-'}</small></td>
      <td><div className="row-actions"><select aria-label={`Status koreksi ${date}`} value={selected[date]||record?.status||'present'} onChange={e=>setSelected({...selected,[date]:e.target.value as HistoryAttendanceStatus})}>{Object.entries(labels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><button type="button" className="secondary-button" onClick={()=>onCorrect(date,selected[date]||record?.status||'present')}>Koreksi</button></div></td>
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
