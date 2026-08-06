-- HappyLaundry V100.5 Pengaturan & WhatsApp
create table if not exists public.v100_store_settings (
  id integer primary key default 1 check (id = 1),
  business_name text not null default 'HappyLaundry Babakan',
  tagline text not null default 'Professional Laundry & Dry Cleaning',
  phone text not null default '089666395940',
  address text not null default 'Babakan, Cirebon',
  operational_hours text not null default E'Senin–Minggu\n08.00–21.00 WIB',
  maps_url text not null default '',
  receipt_footer text not null default 'Terima kasih telah menggunakan HappyLaundry.',
  whatsapp_order_template text not null default E'Halo {{pelanggan}}, cucian Anda sudah kami terima.\n\nNomor order: {{order}}\nTotal: {{total}}\nEstimasi selesai: {{estimasi}}\n\nTerima kasih.\n{{usaha}}',
  whatsapp_ready_template text not null default E'Halo {{pelanggan}}, cucian dengan nomor order {{order}} sudah siap diambil.\n\nTerima kasih.\n{{usaha}}',
  updated_at timestamptz not null default now()
);

insert into public.v100_store_settings(id)
values (1)
on conflict (id) do nothing;

alter table public.v100_store_settings enable row level security;

drop policy if exists v100_store_settings_read on public.v100_store_settings;
create policy v100_store_settings_read on public.v100_store_settings
for select to authenticated using (true);

drop policy if exists v100_store_settings_owner_write on public.v100_store_settings;
create policy v100_store_settings_owner_write on public.v100_store_settings
for all to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'))
with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));

notify pgrst, 'reload schema';
