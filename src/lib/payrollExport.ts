import type {ExportTableOptions} from './exportData'
import {formatRupiah} from './format'
export type PayrollExportRow={employee:{full_name:string};presentDays:number;attendanceRate:number;attendancePay:number;allowance:number;bonus:number;shareDetails:{category:string;percent:number;baseRevenue:number;amount:number}[];productionCommission:number;courierCommission:number;grossTotal:number;cashAdvanceApplied:number;cashAdvanceOutstanding:number;total:number;payrollBalance:number;paidAmount:number;outstanding:number;paymentStatus:string}
export const payrollPaymentLabel=(status:string)=>status==='cashbon'?'Terpotong Kas Bon':status==='nil'?'Nihil':status==='paid'?'Lunas':status==='partial'?'Sebagian':'Belum Dibayar'
export function buildPayrollExport(rows:PayrollExportRow[],month:string,revenue:number):ExportTableOptions{
 const sum=(key:keyof Pick<PayrollExportRow,'grossTotal'|'cashAdvanceApplied'|'cashAdvanceOutstanding'|'total'|'payrollBalance'>)=>Math.round(rows.reduce((s,r)=>s+r[key],0))
 return {
  title:'Daftar Gaji Karyawan',filename:`gaji-karyawan-${month}`,
  subtitle:`Periode ${month} • Omzet aktual ${formatRupiah(revenue)} • Sisa kasbon adalah utang belum dipotong. Saldo setelah sisa kasbon merupakan simulasi, bukan potongan baru.`,
  headers:['Karyawan','Hadir','Tarif/Hari','Uang Kehadiran','Tunjangan','Bonus','Bagi Hasil Kategori','Komisi Produksi','Komisi Kurir','Gaji Kotor','Potongan Kas Bon Periode Ini','Sisa Kas Bon','Gaji Bersih (Potongan Tercatat)','Saldo Setelah Sisa Kas Bon (Simulasi)','Sudah Dibayar','Sisa Gaji Belum Dibayar','Status Pembayaran','Status Saldo (Simulasi)'],
  rows:rows.map(r=>[
   r.employee.full_name,r.presentDays,r.attendanceRate,Math.round(r.attendancePay),Math.round(r.allowance),Math.round(r.bonus),
   r.shareDetails.length?r.shareDetails.map(s=>`${s.category} ${s.percent.toFixed(2)}% x ${Math.round(s.baseRevenue)} = ${Math.round(s.amount)}`).join(' | '):'-',
   Math.round(r.productionCommission),Math.round(r.courierCommission),Math.round(r.grossTotal),Math.round(r.cashAdvanceApplied),Math.round(r.cashAdvanceOutstanding),Math.round(r.total),Math.round(r.payrollBalance),Math.round(r.paidAmount),Math.round(r.outstanding),payrollPaymentLabel(r.paymentStatus),r.payrollBalance<0?'Saldo Minus':'Tidak Minus'
  ]),
  summary:[['Omzet Bulan',Math.round(revenue)],['Total Gaji Kotor',sum('grossTotal')],['Potongan Kas Bon Periode Ini',sum('cashAdvanceApplied')],['Total Sisa Kas Bon',sum('cashAdvanceOutstanding')],['Total Gaji Bersih (Potongan Tercatat)',sum('total')],['Total Saldo Setelah Sisa Kas Bon (Simulasi)',sum('payrollBalance')]]
 }
}
