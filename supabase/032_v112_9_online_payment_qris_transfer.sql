-- HappyLaundry Enterprise V112.9
-- Online Payment QRIS + Transfer + Upload Bukti + Konfirmasi
-- Jalankan SEKALI di Supabase SQL Editor.

create table if not exists public.v1129_online_payment_settings(
  id integer primary key default 1 check(id=1),
  qris_enabled boolean not null default false,
  qris_image_url text null,
  qris_image_path text null,
  qris_merchant_name text not null default 'HappyLaundry',
  qris_note text not null default 'Scan QRIS lalu upload bukti pembayaran.',
  transfer_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.v1129_online_payment_settings(id)
values(1) on conflict(id) do nothing;

create table if not exists public.v1129_bank_accounts(
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  account_number text not null,
  account_name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v1129_payment_proofs(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.v100_orders(id) on delete cascade,
  order_no text not null,
  method text not null check(method in ('qris','transfer')),
  bank_account_id uuid null references public.v1129_bank_accounts(id) on delete set null,
  amount numeric(14,2) not null check(amount>0),
  photo_path text not null,
  status text not null default 'pending' check(status in ('pending','confirmed','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by uuid null,
  review_note text null
);

create index if not exists v1129_payment_proofs_order_idx on public.v1129_payment_proofs(order_id);
create index if not exists v1129_payment_proofs_status_idx on public.v1129_payment_proofs(status,submitted_at);

alter table public.v1129_online_payment_settings enable row level security;
alter table public.v1129_bank_accounts enable row level security;
alter table public.v1129_payment_proofs enable row level security;

-- Owner-only QRIS/rekening management.
drop policy if exists v1129_settings_owner_all on public.v1129_online_payment_settings;
create policy v1129_settings_owner_all on public.v1129_online_payment_settings
for all to authenticated
using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'))
with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));

drop policy if exists v1129_banks_owner_all on public.v1129_bank_accounts;
create policy v1129_banks_owner_all on public.v1129_bank_accounts
for all to authenticated
using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'))
with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));

-- Staff/Owner authenticated sessions can review proof rows.
drop policy if exists v1129_proofs_authenticated_select on public.v1129_payment_proofs;
create policy v1129_proofs_authenticated_select on public.v1129_payment_proofs
for select to authenticated using(true);

-- Storage: QRIS public, proof payment private.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('online-payment-assets','online-payment-assets',true,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=3145728,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-proofs','payment-proofs',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists online_payment_assets_public_read on storage.objects;
create policy online_payment_assets_public_read on storage.objects for select
using(bucket_id='online-payment-assets');

drop policy if exists online_payment_assets_owner_insert on storage.objects;
create policy online_payment_assets_owner_insert on storage.objects for insert to authenticated
with check(bucket_id='online-payment-assets' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));

drop policy if exists online_payment_assets_owner_delete on storage.objects;
create policy online_payment_assets_owner_delete on storage.objects for delete to authenticated
using(bucket_id='online-payment-assets' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));

-- Public customer may upload proof, but cannot read private proof files.
drop policy if exists payment_proofs_public_insert on storage.objects;
create policy payment_proofs_public_insert on storage.objects for insert to anon,authenticated
with check(bucket_id='payment-proofs');

drop policy if exists payment_proofs_authenticated_read on storage.objects;
create policy payment_proofs_authenticated_read on storage.objects for select to authenticated
using(bucket_id='payment-proofs');

drop policy if exists payment_proofs_authenticated_delete on storage.objects;
create policy payment_proofs_authenticated_delete on storage.objects for delete to authenticated
using(bucket_id='payment-proofs');

-- Public payment options: only exposes active payment methods for a valid order number.
create or replace function public.v1129_public_payment_options(p_order_no text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  o public.v100_orders%rowtype;
  s public.v1129_online_payment_settings%rowtype;
  pending jsonb;
  banks jsonb;
begin
  select * into o from public.v100_orders where upper(order_no)=upper(trim(p_order_no)) limit 1;
  if o.id is null then return null; end if;

  select * into s from public.v1129_online_payment_settings where id=1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'bank_name',b.bank_name,'account_number',b.account_number,'account_name',b.account_name
  ) order by b.sort_order,b.bank_name),'[]'::jsonb)
  into banks
  from public.v1129_bank_accounts b
  where b.is_active=true;

  select jsonb_build_object(
    'id',p.id,'method',p.method,'amount',p.amount,'status',p.status,'submitted_at',p.submitted_at
  ) into pending
  from public.v1129_payment_proofs p
  where p.order_id=o.id and p.status='pending'
  order by p.submitted_at desc
  limit 1;

  return jsonb_build_object(
    'order_no',o.order_no,
    'remaining',greatest(0,o.total-o.paid_amount),
    'qris_enabled',coalesce(s.qris_enabled,false),
    'qris_image_url',s.qris_image_url,
    'qris_merchant_name',coalesce(s.qris_merchant_name,'HappyLaundry'),
    'qris_note',coalesce(s.qris_note,''),
    'transfer_enabled',coalesce(s.transfer_enabled,false),
    'banks',banks,
    'pending_proof',pending
  );
end $$;

grant execute on function public.v1129_public_payment_options(text) to anon,authenticated;

-- Public submission: amount is server-calculated from current remaining balance.
create or replace function public.v1129_submit_payment_proof(
  p_order_no text,
  p_method text,
  p_bank_account_id uuid,
  p_photo_path text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  o public.v100_orders%rowtype;
  s public.v1129_online_payment_settings%rowtype;
  remaining numeric(14,2);
  new_id uuid;
begin
  if p_method not in ('qris','transfer') then raise exception 'Metode pembayaran tidak valid.'; end if;
  if coalesce(trim(p_photo_path),'')='' then raise exception 'Foto bukti pembayaran wajib ada.'; end if;

  select * into o from public.v100_orders where upper(order_no)=upper(trim(p_order_no)) limit 1;
  if o.id is null then raise exception 'Nomor order tidak ditemukan.'; end if;

  remaining:=greatest(0,o.total-o.paid_amount);
  if remaining<=0 then raise exception 'Order ini sudah lunas.'; end if;

  if exists(select 1 from public.v1129_payment_proofs where order_id=o.id and status='pending') then
    raise exception 'Masih ada bukti pembayaran yang menunggu konfirmasi.';
  end if;

  select * into s from public.v1129_online_payment_settings where id=1;
  if p_method='qris' and not coalesce(s.qris_enabled,false) then raise exception 'QRIS sedang tidak aktif.'; end if;
  if p_method='transfer' then
    if not coalesce(s.transfer_enabled,false) then raise exception 'Transfer bank sedang tidak aktif.'; end if;
    if p_bank_account_id is null or not exists(select 1 from public.v1129_bank_accounts where id=p_bank_account_id and is_active=true) then
      raise exception 'Rekening tujuan tidak valid.';
    end if;
  end if;

  insert into public.v1129_payment_proofs(order_id,order_no,method,bank_account_id,amount,photo_path)
  values(o.id,o.order_no,p_method,case when p_method='transfer' then p_bank_account_id else null end,remaining,p_photo_path)
  returning id into new_id;

  return new_id;
end $$;

grant execute on function public.v1129_submit_payment_proof(text,text,uuid,text) to anon,authenticated;

-- Confirm: records payment using the existing HappyLaundry payment RPC, then marks proof confirmed.
create or replace function public.v1129_confirm_payment_proof(p_proof_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.v1129_payment_proofs%rowtype;
  o public.v100_orders%rowtype;
  pay_amount numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Login diperlukan.'; end if;

  select * into p from public.v1129_payment_proofs where id=p_proof_id for update;
  if p.id is null then raise exception 'Bukti pembayaran tidak ditemukan.'; end if;
  if p.status<>'pending' then raise exception 'Bukti ini sudah diproses.'; end if;

  select * into o from public.v100_orders where id=p.order_id for update;
  pay_amount:=least(p.amount,greatest(0,o.total-o.paid_amount));
  if pay_amount<=0 then
    update public.v1129_payment_proofs set status='confirmed',reviewed_at=now(),reviewed_by=auth.uid(),review_note='Order sudah lunas sebelum konfirmasi.' where id=p.id;
    return true;
  end if;

  perform public.v100_add_payment(
    p_order_id => p.order_id,
    p_amount => pay_amount,
    p_method => p.method,
    p_notes => 'Konfirmasi pembayaran online dari Tracking Pelanggan'
  );

  update public.v1129_payment_proofs
  set status='confirmed',reviewed_at=now(),reviewed_by=auth.uid(),review_note='Dikonfirmasi lunas'
  where id=p.id;

  return true;
end $$;

grant execute on function public.v1129_confirm_payment_proof(uuid) to authenticated;

create or replace function public.v1129_reject_payment_proof(p_proof_id uuid,p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Login diperlukan.'; end if;

  update public.v1129_payment_proofs
  set status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),review_note=coalesce(nullif(trim(p_reason),''),'Ditolak')
  where id=p_proof_id and status='pending';

  if not found then raise exception 'Bukti tidak ditemukan atau sudah diproses.'; end if;
  return true;
end $$;

grant execute on function public.v1129_reject_payment_proof(uuid,text) to authenticated;

notify pgrst,'reload schema';
