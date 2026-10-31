import {useRef,useState} from 'react'
import {supabase} from '../lib/supabase'
import {formatRupiah} from '../lib/format'
import type {ManagerReport} from '../lib/managerShare'
export function ManagerShareSettings({month,employees,report,onSaved}:{month:string;employees:{id:string;full_name:string}[];report:ManagerReport;onSaved:()=>Promise<void>}){
 const [employee,setEmployee]=useState(''),[percent,setPercent]=useState('40'),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const pending=useRef(false)
 const save=async()=>{
  const value=Number(percent)
  if(!employee||!percent.trim()||!Number.isFinite(value)||value<0||value>100){setMessage('Pilih karyawan dan isi persentase 0–100.');return}
  if(pending.current)return
  pending.current=true;setBusy(true);setMessage('')
  try{
   const {error}=await supabase.rpc('v113151_save_manager_share',{p_month:`${month}-01`,p_employee:employee,p_percent:value})
   if(error)throw error
   await onSaved();setMessage('Pengaturan pengelola tersimpan untuk bulan ini.')
  }catch(e){setMessage(e instanceof Error?e.message:String((e as {message?:string})?.message||e))}
  finally{pending.current=false;setBusy(false)}
 }
 return <section className="panel manager-share-settings">
  <div className="section-title"><b>Bagi Hasil Pengelola — {month}</b></div>
  <p>Nilai order masuk − operasional − gaji dan komisi karyawan. Tanpa cadangan; bagian pengelola tidak mengurangi dasar hitungnya sendiri. Piutang termasuk nilai order. Hak mengikuti data yang sudah disimpan. Simpan Bonus terlebih dahulu jika diubah. Koreksi data atau persentase mengubah hak bulan ini; pembayaran lama tetap tercatat.</p>
  <div className="manager-share-metrics">
   <span>Order masuk <b>{formatRupiah(Number(report.revenue))}</b></span>
   <span>Operasional <b>{formatRupiah(Number(report.operating))}</b></span>
   <span>Gaji &amp; komisi <b>{formatRupiah(Number(report.employee_cost))}</b></span>
   <span>Dasar laba sebelum pengelola <b>{formatRupiah(Number(report.profit_base))}</b></span>
  </div>
  <p>Jika dasar laba nol atau minus, hak bagi hasil nol. Pengaturan hanya untuk bulan yang dipilih; bulan berikutnya perlu diatur. Gunakan 0% untuk menonaktifkan bagian pada bulan ini. Pembayaran dicatat melalui Bayar Gaji.</p>
  <div className="manager-share-form">
   <label>Karyawan pengelola<select aria-label="Karyawan pengelola" value={employee} disabled={busy} onChange={e=>{setEmployee(e.target.value);setPercent(String(report.rows.find(r=>r.employee_id===e.target.value)?.percent??40));setMessage('')}}>
    <option value="">Pilih nama karyawan</option>{employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
   </select></label>
   <label>Bagian pengelola (%)<input aria-label="Bagian pengelola (%)" type="number" min="0" max="100" step="0.01" value={percent} disabled={busy} onChange={e=>setPercent(e.target.value)}/></label>
   <button type="button" className="primary-button" disabled={busy} onClick={()=>void save()}>{busy?'Menyimpan...':'Simpan Bagi Hasil Pengelola'}</button>
  </div>
  {message&&<div role="status" className="info-box">{message}</div>}
  <div className="table-wrap"><table><thead><tr><th>Pengelola</th><th>Persentase</th><th>Hak Bagi Hasil</th></tr></thead><tbody>
   {report.rows.map(r=><tr key={r.employee_id}><td>{r.full_name}</td><td>{Number(r.percent).toLocaleString('id-ID')}%</td><td>{formatRupiah(Number(r.amount))}</td></tr>)}
   {!report.rows.length&&<tr><td colSpan={3}>Belum ada pengelola untuk bulan ini.</td></tr>}
  </tbody></table></div>
 </section>
}
