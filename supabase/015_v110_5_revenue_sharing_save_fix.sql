-- HappyLaundry Enterprise V110.5
-- Revenue Sharing Save Fix
-- Jalankan SETELAH 014_v110_4_finance_revenue_sharing.sql

-- 1) Bersihkan kemungkinan kategori duplikat case-insensitive.
-- Simpan satu baris per kategori, ambil updated_at terbaru.
with ranked as (
  select
    id,
    row_number() over (
      partition by lower(btrim(category))
      order by updated_at desc nulls last, created_at desc nulls last, id
    ) as rn
  from public.v110_revenue_share_settings
)
delete from public.v110_revenue_share_settings s
using ranked r
where s.id=r.id
  and r.rn>1;

-- 2) Normalisasi spasi kategori.
update public.v110_revenue_share_settings
set category=btrim(category),
    updated_at=now()
where category<>btrim(category);

-- 3) Hapus index expression lama jika ada.
drop index if exists public.v110_revenue_share_category_unique;

-- 4) Hapus constraint lama jika pernah dibuat.
alter table public.v110_revenue_share_settings
drop constraint if exists v110_revenue_share_category_unique;

-- 5) Buat UNIQUE CONSTRAINT langsung pada kolom category.
-- Ini kompatibel dengan Supabase upsert({onConflict:'category'}).
alter table public.v110_revenue_share_settings
add constraint v110_revenue_share_category_unique
unique(category);

-- 6) Seed kategori umum tetap aman.
insert into public.v110_revenue_share_settings(category,share_percent) values
('Reguler',0),
('Express',0),
('Premium',0),
('Same Day',0),
('Super Express',0),
('Bed Cover',0),
('Dry Cleaning',0),
('Sepatu',0),
('Tas',0),
('Boneka',0),
('Hotel',0),
('Restoran',0),
('Corporate',0),
('Satuan',0)
on conflict(category) do nothing;

notify pgrst,'reload schema';
