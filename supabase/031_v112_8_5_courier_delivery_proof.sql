-- HappyLaundry Enterprise V112.8.5
-- Bukti Pengiriman Kurir per Nomor Order
-- Jalankan sekali di Supabase SQL Editor.

create table if not exists public.v112_delivery_proofs(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.v100_orders(id) on delete cascade,
  order_no text not null,
  photo_url text not null,
  photo_path text not null,
  note text null,
  confirmed_by uuid null default auth.uid(),
  confirmed_by_name text null,
  delivered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists v112_delivery_proofs_order_id_idx
on public.v112_delivery_proofs(order_id);

create index if not exists v112_delivery_proofs_order_no_idx
on public.v112_delivery_proofs(order_no);

alter table public.v112_delivery_proofs enable row level security;

drop policy if exists v112_delivery_proofs_authenticated_select on public.v112_delivery_proofs;
create policy v112_delivery_proofs_authenticated_select
on public.v112_delivery_proofs
for select to authenticated
using(true);

drop policy if exists v112_delivery_proofs_authenticated_insert on public.v112_delivery_proofs;
create policy v112_delivery_proofs_authenticated_insert
on public.v112_delivery_proofs
for insert to authenticated
with check(auth.uid() is not null);

-- Bucket bukti foto pengiriman.
insert into storage.buckets(
  id,name,public,file_size_limit,allowed_mime_types
)
values(
  'delivery-proofs',
  'delivery-proofs',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict(id)
do update set
  public=true,
  file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists delivery_proofs_public_read on storage.objects;
create policy delivery_proofs_public_read
on storage.objects
for select
using(bucket_id='delivery-proofs');

drop policy if exists delivery_proofs_authenticated_insert on storage.objects;
create policy delivery_proofs_authenticated_insert
on storage.objects
for insert to authenticated
with check(bucket_id='delivery-proofs' and auth.uid() is not null);

drop policy if exists delivery_proofs_authenticated_delete on storage.objects;
create policy delivery_proofs_authenticated_delete
on storage.objects
for delete to authenticated
using(bucket_id='delivery-proofs' and auth.uid() is not null);

notify pgrst,'reload schema';
