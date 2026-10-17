-- HappyLaundry V113.0.143 / SQL 078. Jalankan setelah SQL 077.
-- Produksi diakui dari order masuk + penugasan, tanpa menunggu selesai/lunas.
-- Backfill HANYA pengakuan yang masih NULL sejak 1 Oktober 2026 WIB.
-- Tanggal yang sudah diakui, penerima, tarif, nominal lama dan pembayaran gaji dipertahankan.
-- Tidak menetapkan penerima atau tarif 0% dengan tebakan. Order batal dikecualikan.
begin;
create table if not exists public.v113143_production_recognition_audit(
 source_table text not null,order_id uuid not null references public.v100_orders(id) on delete cascade,employee_id uuid not null references public.v109_users(id) on delete cascade,
 old_earned_at timestamptz,new_earned_at timestamptz not null,
 stored_percent numeric,stored_amount numeric,
 changed_at timestamptz not null default now(),changed_by uuid default auth.uid(),
 primary key(source_table,order_id,employee_id)
);
alter table public.v113143_production_recognition_audit enable row level security;
drop policy if exists owner_read on public.v113143_production_recognition_audit;
create policy owner_read on public.v113143_production_recognition_audit for select to authenticated using(public.v109_is_owner());
grant select on public.v113143_production_recognition_audit to authenticated;
create or replace function public.v113097_set_order_commission_team(
  p_order_id uuid,
  p_production_ids uuid[] default array[]::uuid[],
  p_courier_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.v100_orders%rowtype;
  v_type text;
  v_ids uuid[];
  v_primary uuid;
  v_total_percent numeric(7,3):=0;
  v_count integer:=0;
  v_share numeric(7,3):=0;
  v_employee uuid;
  v_amount numeric(14,2):=0;
  v_earned timestamptz;
  v_old_couriers jsonb;
  v_old_production jsonb;
  v_same_production_team boolean;
  v_same_courier_team boolean;
  v_old_member jsonb;
begin
  if auth.uid() is null then
    raise exception 'Login diperlukan.';
  end if;

  select * into v_order from public.v100_orders where id=p_order_id;
  if not found then raise exception 'Order tidak ditemukan.'; end if;

  select coalesce(jsonb_object_agg(employee_id::text,to_jsonb(m)),'{}'::jsonb) into v_old_couriers
  from public.v113097_order_commission_members m where order_id=p_order_id and commission_type='courier';
  select coalesce(array_agg(employee_id order by employee_id),array[]::uuid[]) =
    coalesce((select array_agg(distinct x order by x) from unnest(coalesce(p_courier_ids,array[]::uuid[])) x where x is not null),array[]::uuid[])
  into v_same_courier_team from public.v113097_order_commission_members where order_id=p_order_id and commission_type='courier';

  select coalesce(jsonb_object_agg(employee_id::text,to_jsonb(m)),'{}'::jsonb) into v_old_production
  from public.v113097_order_commission_members m where order_id=p_order_id and commission_type='production';
  select coalesce(array_agg(employee_id order by employee_id),array[]::uuid[]) =
    coalesce((select array_agg(distinct x order by x) from unnest(coalesce(p_production_ids,array[]::uuid[])) x where x is not null),array[]::uuid[])
  into v_same_production_team from public.v113097_order_commission_members where order_id=p_order_id and commission_type='production';

  foreach v_type in array array['production','courier'] loop
    if v_type='production' then
      select coalesce(array_agg(distinct x),array[]::uuid[])
      into v_ids
      from unnest(coalesce(p_production_ids,array[]::uuid[])) x
      where x is not null;
    else
      select coalesce(array_agg(distinct x),array[]::uuid[])
      into v_ids
      from unnest(coalesce(p_courier_ids,array[]::uuid[])) x
      where x is not null;
    end if;

    delete from public.v113097_order_commission_members
    where order_id=p_order_id and commission_type=v_type;

    v_count:=coalesce(array_length(v_ids,1),0);
    if v_count=0 then continue; end if;

    v_primary:=v_ids[1];

    if v_type='production' then
      select coalesce(production_percent,0) into v_total_percent
      from public.v113_employee_commission_settings where employee_id=v_primary;
    else
      select coalesce(courier_percent,0) into v_total_percent
      from public.v113_employee_commission_settings where employee_id=v_primary;
    end if;
    v_total_percent:=coalesce(v_total_percent,0);
    v_share:=round(100.0/v_count,3);

    if v_type='production' and v_order.status<>'cancelled' then
      v_earned:=v_order.created_at;
    elsif v_type='courier' and v_order.status<>'cancelled' then
      v_earned:=v_order.created_at;
    else
      v_earned:=null;
    end if;

    foreach v_employee in array v_ids loop
      if v_type='courier' then
        v_earned:=case when v_order.status<>'cancelled' then v_order.created_at else null end;
        if v_same_courier_team then
          v_old_member:=v_old_couriers->v_employee::text;
          v_total_percent:=coalesce((v_old_member->>'total_percent')::numeric,v_total_percent);
          v_share:=coalesce((v_old_member->>'share_percent')::numeric,v_share);
          if v_order.status<>'cancelled' then v_earned:=coalesce((v_old_member->>'earned_at')::timestamptz,v_order.created_at); end if;
        end if;
      end if;
      if v_type='production' then
        v_earned:=case when v_order.status<>'cancelled' then v_order.created_at else null end;
        if v_same_production_team then
          v_old_member:=v_old_production->v_employee::text;
          v_total_percent:=coalesce((v_old_member->>'total_percent')::numeric,v_total_percent);
          v_share:=coalesce((v_old_member->>'share_percent')::numeric,v_share);
          if v_order.status<>'cancelled' then v_earned:=coalesce((v_old_member->>'earned_at')::timestamptz,v_order.created_at); end if;
        end if;
      end if;
      v_amount:=round(coalesce(v_order.total,0)*v_total_percent/100.0/v_count,2);

      insert into public.v113097_order_commission_members(
        order_id,commission_type,employee_id,is_primary,total_percent,share_percent,
        base_amount,amount,earned_at,updated_at
      ) values (
        p_order_id,v_type,v_employee,(v_employee=v_primary),v_total_percent,v_share,
        coalesce(v_order.total,0),v_amount,v_earned,now()
      );
    end loop;
  end loop;
end;
$$;

grant execute on function public.v113097_set_order_commission_team(uuid,uuid[],uuid[]) to authenticated;


-- Dijalankan sesudah trigger prepare/normalisasi kurir SQL 077.
-- Hanya tanggal pengakuan produksi; tarif dan nominal tidak disentuh.
create or replace function public.v113143_recognize_production_on_write()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_created timestamptz;v_status text;
begin
 select created_at,status into v_created,v_status from public.v100_orders where id=new.order_id;
 if not found then raise exception 'Order tidak ditemukan.'; end if;
 if TG_TABLE_NAME='v113097_order_commission_members' then
  if new.commission_type<>'production' then return new; end if;
  if v_status='cancelled' then new.earned_at:=null;
  elsif TG_OP='UPDATE' then
   if old.employee_id is not distinct from new.employee_id and old.order_id=new.order_id then new.earned_at:=coalesce(old.earned_at,v_created);
   else new.earned_at:=v_created; end if;
  else new.earned_at:=coalesce(new.earned_at,v_created); end if;
 else
  if new.worker_id is null or v_status='cancelled' then new.worker_earned_at:=null;
  elsif TG_OP='UPDATE' then
   if old.worker_id is not distinct from new.worker_id then new.worker_earned_at:=coalesce(old.worker_earned_at,v_created);
   else new.worker_earned_at:=v_created; end if;
  else new.worker_earned_at:=v_created; end if;
 end if;
 return new;
end; $$;
revoke all on function public.v113143_recognize_production_on_write() from public,anon,authenticated;
drop trigger if exists zz_v113143_production_recognition on public.v113_order_commissions;
create trigger zz_v113143_production_recognition before insert or update on public.v113_order_commissions
for each row execute function public.v113143_recognize_production_on_write();
drop trigger if exists zz_v113143_production_recognition on public.v113097_order_commission_members;
create trigger zz_v113143_production_recognition before insert or update on public.v113097_order_commission_members
for each row execute function public.v113143_recognize_production_on_write();
lock table public.v113_order_commissions,public.v113097_order_commission_members in share row exclusive mode;
insert into public.v113143_production_recognition_audit(source_table,order_id,employee_id,old_earned_at,new_earned_at,stored_percent,stored_amount)
select 'team',m.order_id,m.employee_id,m.earned_at,o.created_at,m.total_percent,m.amount
from public.v113097_order_commission_members m join public.v100_orders o on o.id=m.order_id
where m.commission_type='production' and m.earned_at is null and o.status<>'cancelled'
 and o.created_at>='2026-10-01T00:00:00+07:00'::timestamptz and o.created_at<=now()
on conflict do nothing;
update public.v113097_order_commission_members m set earned_at=o.created_at,updated_at=now()
from public.v100_orders o where o.id=m.order_id and m.commission_type='production' and m.earned_at is null
 and o.status<>'cancelled' and o.created_at>='2026-10-01T00:00:00+07:00'::timestamptz and o.created_at<=now();
insert into public.v113143_production_recognition_audit(source_table,order_id,employee_id,old_earned_at,new_earned_at,stored_percent,stored_amount)
select 'legacy',c.order_id,c.worker_id,c.worker_earned_at,o.created_at,c.worker_percent,c.worker_amount
from public.v113_order_commissions c join public.v100_orders o on o.id=c.order_id
where c.worker_id is not null and c.worker_earned_at is null and o.status<>'cancelled'
 and o.created_at>='2026-10-01T00:00:00+07:00'::timestamptz and o.created_at<=now()
 and not exists(select 1 from public.v113097_order_commission_members m where m.order_id=c.order_id and m.commission_type='production')
on conflict do nothing;
update public.v113_order_commissions c set worker_earned_at=o.created_at,updated_at=now()
from public.v100_orders o where o.id=c.order_id and c.worker_id is not null and c.worker_earned_at is null
 and o.status<>'cancelled' and o.created_at>='2026-10-01T00:00:00+07:00'::timestamptz and o.created_at<=now()
 and not exists(select 1 from public.v113097_order_commission_members m where m.order_id=c.order_id and m.commission_type='production');
create or replace view public.v113_commission_ledger
with (security_invoker=true)
as
select
  m.order_id,o.order_no,m.employee_id,m.commission_type,m.base_amount,
  (m.total_percent*m.share_percent/100.0)::numeric(7,3) as percent,
  m.amount,m.earned_at
from public.v113097_order_commission_members m
join public.v100_orders o on o.id=m.order_id
where m.earned_at is not null and o.status<>'cancelled'

union all

select
  c.order_id,o.order_no,c.worker_id as employee_id,'production'::text as commission_type,
  c.base_amount,c.worker_percent as percent,c.worker_amount as amount,c.worker_earned_at as earned_at
from public.v113_order_commissions c
join public.v100_orders o on o.id=c.order_id
where o.status<>'cancelled' and c.worker_id is not null
  and c.worker_earned_at is not null
  and not exists(
    select 1 from public.v113097_order_commission_members m
    where m.order_id=c.order_id and m.commission_type='production'
  )

union all

select
  c.order_id,o.order_no,c.courier_id as employee_id,'courier'::text as commission_type,
  c.base_amount,c.courier_percent as percent,c.courier_amount as amount,c.courier_earned_at as earned_at
from public.v113_order_commissions c
join public.v100_orders o on o.id=c.order_id
where o.status<>'cancelled' and c.courier_id is not null
  and c.courier_earned_at is not null
  and not exists(
    select 1 from public.v113097_order_commission_members m
    where m.order_id=c.order_id and m.commission_type='courier'
  );

grant select on public.v113_commission_ledger to authenticated;


notify pgrst,'reload schema';
commit;
-- Hasil pembanding laporan gaji: seluruh karyawan pada bulan berjalan WIB.
select u.full_name as nama_karyawan,
 count(distinct l.order_id) as jumlah_nota,
 count(*) as jumlah_hak_komisi,
 count(*) filter(where l.amount=0) as hak_komisi_nol,
 coalesce(sum(l.amount),0) as total_komisi
from public.v113_commission_ledger l
left join public.v109_users u on u.id=l.employee_id
where l.commission_type='production'
 and l.earned_at>=(date_trunc('month',now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta')
 and l.earned_at<((date_trunc('month',now() at time zone 'Asia/Jakarta')+interval '1 month') at time zone 'Asia/Jakarta')
group by l.employee_id,u.full_name order by total_komisi desc;
