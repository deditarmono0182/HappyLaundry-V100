import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, CalendarCheck2, CircleDollarSign, FileText,
  Landmark, ReceiptText, Target, TrendingUp, WalletCards
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'

const sections=[
  {
    title:'Ringkasan & Analisis',
    items:[
      {to:'/finance',title:'Keuangan',description:'Pendapatan, pengeluaran, biaya operasional, dan ringkasan keuangan.',icon:CircleDollarSign},
      {to:'/profit-loss',title:'Laba Rugi',description:'Lihat laba bersih operasional, cadangan, margin, dan detail sumber.',icon:TrendingUp},
      {to:'/profit-target',title:'Target Bisnis',description:'Pantau target omzet, laba, jumlah order, dan progres bulan berjalan.',icon:Target},
      {to:'/reports',title:'Laporan Owner',description:'Ringkasan laporan bisnis dan export data Owner.',icon:BarChart3}
    ]
  },
  {
    title:'Kas & Tagihan',
    items:[
      {to:'/receivables',title:'Piutang',description:'Daftar order belum lunas dan sisa tagihan pelanggan.',icon:AlertTriangle},
      {to:'/cash',title:'Kas Harian',description:'Catat pemasukan dan pengeluaran kas operasional harian.',icon:WalletCards},
      {to:'/daily-closing',title:'Closing Harian',description:'Cocokkan kas sistem dengan uang fisik dan simpan snapshot akhir hari.',icon:CalendarCheck2}
    ]
  },
  {
    title:'Akses Cepat',
    items:[
      {to:'/finance/income',title:'Detail Pemasukan',description:'Buka rincian sumber pemasukan periode keuangan.',icon:Landmark},
      {to:'/finance/expenses',title:'Detail Pengeluaran',description:'Buka rincian pengeluaran dan bukti transaksi.',icon:ReceiptText},
      {to:'/payroll',title:'Absensi & Gaji',description:'Akses payroll, komisi, bonus, kas bon, dan pembayaran gaji.',icon:FileText}
    ]
  }
] as const

export function FinanceReportsHubPage(){
  const navigate=useNavigate()

  return <div className="finance-reports-hub">
    <PageHeader
      eyebrow="KONTROL OWNER"
      title="Keuangan & Laporan"
      description="Semua kontrol keuangan dan laporan Owner dalam satu tempat."
    />

    <section className="finance-hub-intro">
      <div>
        <b>Satu pusat untuk kontrol bisnis</b>
        <span>Menu di sidebar disederhanakan. Semua halaman lama tetap ada dan datanya tidak berubah.</span>
      </div>
    </section>

    {sections.map(section=><section className="finance-hub-section" key={section.title}>
      <h2>{section.title}</h2>
      <div className="finance-hub-grid">
        {section.items.map(item=>{
          const Icon=item.icon
          return <button type="button" className="finance-hub-card" key={item.to} onClick={()=>navigate(item.to)}>
            <span className="finance-hub-icon"><Icon size={23}/></span>
            <span className="finance-hub-copy">
              <b>{item.title}</b>
              <small>{item.description}</small>
            </span>
            <span className="finance-hub-arrow">→</span>
          </button>
        })}
      </div>
    </section>)}
  </div>
}
