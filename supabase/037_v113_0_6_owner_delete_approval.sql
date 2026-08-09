-- HappyLaundry Enterprise V113.0.6
-- Owner Delete Approval: Order + Pengeluaran
-- Jalankan setelah SQL 036.

create table if not exists public.v11306_delete_requests(
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check(entity_type in ('order','expense')),
  entity_id uuid not null,
  entity_label text not null,
  reason text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  requested_by uuid not null default auth.uid(),
  requested_by_name text null,
  requested_at timestamptz not null default now(),
  reviewed_by uuid null,
  reviewed_by_name text null,
  reviewed_at timestamptz null,
  review_note text null,
  snapshot jsonb null
);

create unique index if not exists v11306_delete_pending_unique
on public.v11306_delete_requests(entity_type,entity_id)
where status='pending';

create index if not exists v11306_delete_status_idx
on public.v11306_delete_requests(status,requested_at);

alter table public.v11306_delete_requests enable row level security;

-- Owner dapat melihat seluruh request; requester dapat melihat request miliknya.
drop policy if exists v11306_delete_select on public.v11306_delete_requests;
create policy v11306_delete_select
on public.v11306_delete_requests
for select to authenticated
using(
  requested_by=auth.uid()
  or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner')
);

-- Tidak ada insert/update/delete langsung dari client.
-- Semua perubahan hanya melalui RPC SECURITY DEFINER.

create or replace function public.v11306_user_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(
    (select p.full_name from public.profiles p where p.id=p_uid limit 1),
    (select u.full_name from public.v109_users u where u.auth_uid=p_uid limit 1),
    'Pengguna'
  );
$$;

create or replace function public.v11306_is_owner()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner');
$$;

create or replace function public.v11306_request_delete(
  p_entity_type text,
  p_entity_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_label text;
  v_snapshot jsonb;
begin
  if auth.uid() is null then raise exception 'Login diperlukan.'; end if;
  if p_entity_type not in ('order','expense') then raise exception 'Jenis data tidak valid.'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Alasan penghapusan minimal 5 karakter.'; end if;

  if p_entity_type='order' then
    select o.order_no,
      jsonb_build_object(
        'order_no',o.order_no,
        'customer_name',c.name,
        'customer_phone',c.phone,
        'status',o.status,
        'payment_status',o.payment_status,
        'total',o.total,
        'paid_amount',o.paid_amount,
        'created_at',o.created_at
      )
    into v_label,v_snapshot
    from public.v100_orders o
    join public.v100_customers c on c.id=o.customer_id
    where o.id=p_entity_id;
  else
    select 'Pengeluaran • '||e.category_name||' • Rp '||trim(to_char(e.amount,'FM999G999G999G990')),
      jsonb_build_object(
        'expense_date',e.expense_date,
        'category_name',e.category_name,
        'amount',e.amount,
        'payment_method',e.payment_method,
        'description',e.description,
        'reference',e.reference,
        'proof_path',e.proof_path
      )
    into v_label,v_snapshot
    from public.v106_expenses e
    where e.id=p_entity_id;
  end if;

  if v_label is null then raise exception 'Data tidak ditemukan.'; end if;

  insert into public.v11306_delete_requests(
    entity_type,entity_id,entity_label,reason,requested_by,requested_by_name,snapshot
  ) values(
    p_entity_type,p_entity_id,v_label,trim(p_reason),auth.uid(),public.v11306_user_name(auth.uid()),v_snapshot
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Data ini sudah mempunyai permintaan hapus yang menunggu Owner.';
end $$;

grant execute on function public.v11306_request_delete(text,uuid,text) to authenticated;

create or replace function public.v11306_execute_delete(
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,storage
as $$
declare
  v_files jsonb:='[]'::jsonb;
  v_path text;
begin
  if p_entity_type='order' then
    -- Simpan daftar file sebelum FK cascade menghapus metadata.
    for v_path in select photo_path from public.v112_delivery_proofs where order_id=p_entity_id and photo_path is not null loop
      v_files:=v_files||jsonb_build_array(jsonb_build_object('bucket','delivery-proofs','path',v_path));
    end loop;
    for v_path in select photo_path from public.v1129_payment_proofs where order_id=p_entity_id and photo_path is not null loop
      v_files:=v_files||jsonb_build_array(jsonb_build_object('bucket','payment-proofs','path',v_path));
    end loop;

    delete from public.v100_orders where id=p_entity_id;
    if not found then raise exception 'Order sudah tidak ditemukan.'; end if;

  elsif p_entity_type='expense' then
    select proof_path into v_path from public.v106_expenses where id=p_entity_id;
    if v_path is not null then
      v_files:=v_files||jsonb_build_array(jsonb_build_object('bucket','expense-proofs','path',v_path));
    end if;
    delete from public.v106_expenses where id=p_entity_id;
    if not found then raise exception 'Pengeluaran sudah tidak ditemukan.'; end if;
  else
    raise exception 'Jenis data tidak valid.';
  end if;

  return jsonb_build_object('deleted',true,'files',v_files);
end $$;

create or replace function public.v11306_review_delete_request(
  p_request_id uuid,
  p_approve boolean,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.v11306_delete_requests%rowtype;
  result jsonb;
begin
  if not public.v11306_is_owner() then raise exception 'Hanya Owner yang dapat menyetujui penghapusan.'; end if;

  select * into r
  from public.v11306_delete_requests
  where id=p_request_id
  for update;

  if r.id is null then raise exception 'Permintaan tidak ditemukan.'; end if;
  if r.status<>'pending' then raise exception 'Permintaan ini sudah diproses.'; end if;

  if p_approve then
    result:=public.v11306_execute_delete(r.entity_type,r.entity_id);
    update public.v11306_delete_requests set
      status='approved',
      reviewed_by=auth.uid(),
      reviewed_by_name=public.v11306_user_name(auth.uid()),
      reviewed_at=now(),
      review_note=coalesce(nullif(trim(p_review_note),''),'Disetujui Owner')
    where id=r.id;
    return result||jsonb_build_object('request_id',r.id,'status','approved');
  else
    update public.v11306_delete_requests set
      status='rejected',
      reviewed_by=auth.uid(),
      reviewed_by_name=public.v11306_user_name(auth.uid()),
      reviewed_at=now(),
      review_note=coalesce(nullif(trim(p_review_note),''),'Ditolak Owner')
    where id=r.id;
    return jsonb_build_object('request_id',r.id,'status','rejected','files','[]'::jsonb);
  end if;
end $$;

grant execute on function public.v11306_review_delete_request(uuid,boolean,text) to authenticated;

-- Owner hapus langsung: tetap dicatat sebagai request yang langsung approved.
create or replace function public.v11306_owner_delete_direct(
  p_entity_type text,
  p_entity_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  req_id uuid;
  result jsonb;
begin
  if not public.v11306_is_owner() then raise exception 'Hanya Owner yang dapat menghapus langsung.'; end if;
  req_id:=public.v11306_request_delete(p_entity_type,p_entity_id,p_reason);
  result:=public.v11306_review_delete_request(req_id,true,'Dihapus langsung oleh Owner');
  return result;
end $$;

grant execute on function public.v11306_owner_delete_direct(text,uuid,text) to authenticated;

-- Tutup DELETE langsung dari karyawan pada Order.
drop policy if exists v100_orders_authenticated_all on public.v100_orders;
drop policy if exists v11306_orders_select on public.v100_orders;
drop policy if exists v11306_orders_insert on public.v100_orders;
drop policy if exists v11306_orders_update on public.v100_orders;
drop policy if exists v11306_orders_delete_owner on public.v100_orders;

create policy v11306_orders_select on public.v100_orders for select to authenticated using(true);
create policy v11306_orders_insert on public.v100_orders for insert to authenticated with check(true);
create policy v11306_orders_update on public.v100_orders for update to authenticated using(true) with check(true);
create policy v11306_orders_delete_owner on public.v100_orders for delete to authenticated
using(public.v11306_is_owner());

-- Tutup DELETE langsung dari karyawan pada Pengeluaran.
drop policy if exists v11304_expenses_delete on public.v106_expenses;
drop policy if exists v11306_expenses_delete_owner on public.v106_expenses;
create policy v11306_expenses_delete_owner on public.v106_expenses for delete to authenticated
using(public.v11306_is_owner());

notify pgrst,'reload schema';
