import {formatRupiah} from '../lib/format'
export type FinanceCashAdvanceSummaryRow={employee_id:string;employee_name:string;amount:number;remaining_amount:number;paid_amount:number;transaction_count:number;active_count:number}
export function FinanceCashAdvanceSummary({rows,onSelect}:{rows:FinanceCashAdvanceSummaryRow[];onSelect:(id:string)=>void}){
 return <>
  <div className="finance-cash-advance-summary">
   <div><span>Kas Bon Aktif (Catatan)</span><b>{rows.reduce((sum,row)=>sum+Number(row.active_count||0),0)}</b></div>
   <div><span>Total Sisa Piutang Karyawan</span><b>{formatRupiah(rows.reduce((sum,row)=>sum+Number(row.remaining_amount||0),0))}</b></div>
  </div>
  <p>Ringkasan seluruh kasbon per karyawan. Klik nama untuk melihat setiap transaksi.</p>
  <div className="table-wrap finance-cash-advance-table"><table>
   <thead><tr><th>Karyawan</th><th>Total Kasbon</th><th>Potongan / Pembayaran</th><th>Total Sisa Kasbon</th><th>Jumlah Kasbon</th><th>Status</th></tr></thead>
   <tbody>{rows.map(row=><tr key={row.employee_id}>
    <td><button type="button" className="cash-advance-employee-link" title={`Lihat rincian kasbon ${row.employee_name}`} onClick={()=>onSelect(row.employee_id)}>{row.employee_name}</button></td>
    <td>{formatRupiah(Number(row.amount||0))}</td>
    <td>{formatRupiah(Number(row.paid_amount||0))}</td>
    <td><b>{formatRupiah(Number(row.remaining_amount||0))}</b></td>
    <td>{row.transaction_count} catatan ({row.active_count} aktif)</td>
    <td><span className={`badge ${Number(row.remaining_amount)>0?'payment-partial':'payment-paid'}`}>{Number(row.remaining_amount)>0?'Aktif':'Lunas'}</span></td>
   </tr>)}
   {rows.length===0&&<tr><td colSpan={6} className="table-empty">Belum ada kas bon karyawan.</td></tr>}
   </tbody>
  </table></div>
  <p className="cash-report-note">Total kasbon memakai nominal setelah koreksi. Potongan/pembayaran dihitung dari total kasbon dikurangi saldo tersisa, termasuk penyesuaian saldo; bukan otomatis kas masuk.</p>
 </>
}
