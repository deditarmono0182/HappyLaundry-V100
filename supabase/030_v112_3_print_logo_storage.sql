-- HappyLaundry Enterprise V112.3
-- Pengaturan Logo Nota + Supabase Storage
-- Jalankan setelah SQL 023_v110_8_print_nota_settings.sql.

alter table public.v110_receipt_print_settings
add column if not exists logo_url text not null default '';

alter table public.v110_receipt_print_settings
add column if not exists logo_path text not null default '';

alter table public.v110_receipt_print_settings
add column if not exists logo_width integer not null default 64
check(logo_width between 30 and 180);

alter table public.v110_receipt_print_settings
add column if not exists logo_align text not null default 'center'
check(logo_align in('left','center','right'));

-- Public bucket: nota harus dapat menampilkan logo pada jendela print/PDF tanpa auth tambahan.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'receipt-assets',
  'receipt-assets',
  true,
  2097152,
  array['image/png','image/jpeg','image/webp']
)
on conflict(id)
do update set
  public=true,
  file_size_limit=2097152,
  allowed_mime_types=array['image/png','image/jpeg','image/webp'];

-- Semua orang dapat membaca object karena bucket memang public.
drop policy if exists receipt_assets_public_read on storage.objects;
create policy receipt_assets_public_read
on storage.objects
for select
using(bucket_id='receipt-assets');

-- Hanya Owner dapat upload logo.
drop policy if exists receipt_assets_owner_insert on storage.objects;
create policy receipt_assets_owner_insert
on storage.objects
for insert to authenticated
with check(
  bucket_id='receipt-assets'
  and exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
);

-- Hanya Owner dapat update object.
drop policy if exists receipt_assets_owner_update on storage.objects;
create policy receipt_assets_owner_update
on storage.objects
for update to authenticated
using(
  bucket_id='receipt-assets'
  and exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
)
with check(
  bucket_id='receipt-assets'
  and exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
);

-- Hanya Owner dapat menghapus logo custom.
drop policy if exists receipt_assets_owner_delete on storage.objects;
create policy receipt_assets_owner_delete
on storage.objects
for delete to authenticated
using(
  bucket_id='receipt-assets'
  and exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  )
);

notify pgrst,'reload schema';
