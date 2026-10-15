import {formatRupiah} from '../lib/format'
import {cashAdvanceExcess,type CashAdvanceLimitState} from '../lib/cashAdvanceLimit'
export function CashAdvanceWarning({state,amount,owner,reason,onReason,onRefresh,showReason=true}:{state:CashAdvanceLimitState;amount:number;owner:boolean;reason:string;onReason:(reason:string)=>void;onRefresh:()=>void;showReason?:boolean}){
 if(state.loading)return <div role="status" className="info-box">Memeriksa batas kasbon terhadap gaji...</div>
 if(state.error||!state.limit)return <div role="alert" className="error-box">Batas kasbon belum dapat diperiksa. {state.error} Pastikan SQL 072 sudah dijalankan. <button type="button" className="secondary-button" onClick={onRefresh}>Coba Lagi</button></div>
 const limit=state.limit,excess=cashAdvanceExcess(limit,amount)
 return <div className="cash-advance-limit">
  <p>Gaji tersedia bulan {limit.payroll_month.slice(0,7)}: <b>{formatRupiah(Number(limit.salary_available))}</b><br/>Sisa kasbon + pengajuan: <b>{formatRupiah(Number(limit.outstanding)+Math.max(0,amount||0))}</b></p>
  <small>Gaji yang sudah tercatat bulan berjalan (WIB), setelah potongan kasbon dan pembayaran gaji. Belum termasuk hari kerja mendatang.</small>
  {excess>0&&<div role="alert" className="error-box"><b>⚠ Kasbon melebihi gaji sebesar {formatRupiah(excess)}.</b><p>{owner?'Persetujuan Owner diperlukan untuk melanjutkan.':'Pengajuan diblokir. Hubungi Owner untuk persetujuan.'}</p></div>}
  {excess>0&&owner&&showReason&&<label>Alasan Persetujuan Owner (minimal 5 karakter)<textarea value={reason} onChange={e=>onReason(e.target.value)} minLength={5} required rows={2}/></label>}
 </div>
}
