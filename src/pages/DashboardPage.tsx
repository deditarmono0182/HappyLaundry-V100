import { useEffect, useState } from 'react'
import { Banknote, ShoppingBag, Users, WashingMachine, PackageCheck, Sparkles } from 'lucide-react'
import { StatCard } from '../components/StatCard'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

interface Counts { customers: number; services: number; orders: number }

export function DashboardPage() {
  const { profile } = useAuth()
  const [counts, setCounts] = useState<Counts>({ customers: 0, services: 0, orders: 0 })

  useEffect(() => {
    const load = async () => {
      const [customers, services, orders] = await Promise.all([
        supabase.from('v100_customers').select('*', { count: 'exact', head: true }),
        supabase.from('v100_services').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('orders').select('*', { count: 'exact', head: true })
      ])
      setCounts({ customers: customers.count || 0, services: services.count || 0, orders: orders.count || 0 })
    }
    void load()
  }, [])

  return (
    <>
      <section className="welcome-banner">
        <div><span className="eyebrow">SELAMAT DATANG</span><h2>Halo, {profile?.full_name || 'Tim HappyLaundry'} 👋</h2><p>V100.1 Master Data aktif. Pelanggan dan layanan sekarang tersimpan di Supabase.</p></div>
        <div className="welcome-art">🧺🫧👕</div>
      </section>
      <section className="stats-grid">
        <StatCard label="Omzet Hari Ini" value="Rp0" caption="Aktif pada modul Order" icon={Banknote} />
        <StatCard label="Total Order" value={String(counts.orders)} caption="Database Supabase" icon={ShoppingBag} />
        <StatCard label="Pelanggan" value={String(counts.customers)} caption="Master pelanggan aktif" icon={Users} />
        <StatCard label="Sedang Diproses" value="0" caption="Aktif pada modul Produksi" icon={WashingMachine} />
        <StatCard label="Siap Diambil" value="0" caption="Aktif pada modul Produksi" icon={PackageCheck} />
        <StatCard label="Layanan Aktif" value={String(counts.services)} caption="Harga siap digunakan" icon={Sparkles} />
      </section>
      <section className="two-column">
        <article className="panel"><h3>Yang Sudah Aktif</h3><div className="system-list"><div><span>Login dan hak akses</span><b className="success">Aktif</b></div><div><span>Master Pelanggan</span><b className="success">Aktif</b></div><div><span>Layanan & Harga</span><b className="success">Aktif</b></div><div><span>Dashboard Supabase</span><b className="success">Aktif</b></div></div></article>
        <article className="panel"><h3>Tahap Berikutnya</h3><div className="empty-state compact-empty"><span>🧾</span><b>V100.2 Order Laundry</b><p>Order baru, item layanan, total, pembayaran, dan nota 58 mm.</p></div></article>
      </section>
    </>
  )
}
