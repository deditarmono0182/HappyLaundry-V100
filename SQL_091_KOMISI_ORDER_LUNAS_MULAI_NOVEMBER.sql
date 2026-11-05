-- HappyLaundry V113.0.171. Jalankan SETELAH SQL 078 dan 087 (090 tetap dipertahankan).
-- Mulai 1 November 2026 WIB: komisi produksi/kurir dan dasar pengelola dari order lunas.
-- Komisi sebelum November disalin sekali, tidak dihitung ulang/dibayar ulang.
-- Tidak mengubah pembayaran gaji, potongan/pinjaman kasbon, atau transaksi pelanggan.
begin;
lock table public.v100_orders,public.v100_payments,public.v113_order_commissions,
 public.v113097_order_commission_members,public.v113_payroll_payments,
 public.v113072_cash_advance_deductions in share row exclusive mode;

create table if not exists public.v113171_commission_policy(
 singleton boolean primary key default true check(singleton),
 effective_at timestamptz not null,
 installed_at timestamptz not null default now()
);
alter table public.v113171_commission_policy enable row level security;
drop policy if exists read_policy on public.v113171_commission_policy;
create policy read_policy on public.v113171_commission_policy for select to authenticated using(true);
revoke all on public.v113171_commission_policy from public,anon,authenticated;
grant select on public.v113171_commission_policy to authenticated;

-- Keep the original source view exactly once. Re-running must not clone the new ledger.
do $$begin
 if to_regclass('public.v113171_commission_source') is null then
  execute 'create view public.v113171_commission_source with(security_invoker=true) as '
   ||pg_get_viewdef('public.v113_commission_ledger'::regclass,true);
 end if;
end$$;
grant select on public.v113171_commission_source to authenticated;

create table if not exists public.v113171_legacy_commissions as
 select * from public.v113171_commission_source with no data;
create unique index if not exists v113171_legacy_commission_key
 on public.v113171_legacy_commissions(order_id,commission_type,employee_id);
create index if not exists v113171_legacy_month on public.v113171_legacy_commissions(earned_at,employee_id);
alter table public.v113171_legacy_commissions enable row level security;
drop policy if exists read_legacy on public.v113171_legacy_commissions;
create policy read_legacy on public.v113171_legacy_commissions for select to authenticated using(true);
revoke all on public.v113171_legacy_commissions from public,anon,authenticated;
grant select on public.v113171_legacy_commissions to authenticated;

do $$declare cutoff timestamptz:='2026-11-01 00:00:00+07';begin
 if not exists(select 1 from public.v113171_commission_policy) then
  -- Stop safely if the period being changed already has salary payments/deductions.
  if exists(select 1 from public.v113_payroll_payments where payroll_month>=date '2026-11-01' and amount>0)
   or exists(select 1 from public.v113072_cash_advance_deductions where payroll_month>=date '2026-11-01' and amount>0) then
   raise exception 'SQL091 dibatalkan: November 2026 atau sesudahnya sudah memiliki pembayaran gaji/potongan kasbon. Jangan hapus transaksi. Perlu menentukan periode mulai yang aman terlebih dahulu.';
  end if;
  insert into public.v113171_legacy_commissions
   select * from public.v113171_commission_source where earned_at<cutoff;
  insert into public.v113171_commission_policy(singleton,effective_at) values(true,cutoff);
 end if;
end$$;

create table if not exists public.v113171_order_settlements(
 order_id uuid primary key references public.v100_orders(id) on delete cascade,
 fully_paid_at timestamptz not null
);
alter table public.v113171_order_settlements enable row level security;
drop policy if exists read_settlement on public.v113171_order_settlements;
create policy read_settlement on public.v113171_order_settlements for select to authenticated using(true);
revoke all on public.v113171_order_settlements from public,anon,authenticated;
grant select on public.v113171_order_settlements to authenticated;

-- For already-paid orders, use the first recorded payment at which cumulative
-- receipts reached the CURRENT order total. With no matching evidence, use
-- installation time; never invent a historical payment date.
with running as(
 select p.order_id,p.created_at,
 sum(p.amount) over(partition by p.order_id order by p.created_at,p.id rows unbounded preceding) paid
 from public.v100_payments p
), dates as(
 select r.order_id,min(r.created_at) paid_at from running r
 join public.v100_orders o on o.id=r.order_id where r.paid>=o.total group by r.order_id
)
insert into public.v113171_order_settlements(order_id,fully_paid_at)
select o.id,coalesce(d.paid_at,now()) from public.v100_orders o
left join dates d on d.order_id=o.id
where o.total>0 and o.paid_amount>=o.total and o.status<>'cancelled'
on conflict(order_id) do nothing;

create or replace function public.v113171_track_settlement()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.total>0 and new.paid_amount>=new.total and new.status<>'cancelled' then
  -- A new full settlement after a refund/price increase gets its new date.
  if TG_OP='INSERT' or old.total<=0 or old.paid_amount<old.total or old.status='cancelled' then
   insert into public.v113171_order_settlements(order_id,fully_paid_at) values(new.id,now())
   on conflict(order_id) do update set fully_paid_at=excluded.fully_paid_at;
  else
   insert into public.v113171_order_settlements(order_id,fully_paid_at) values(new.id,now())
   on conflict(order_id) do nothing;
  end if;
 end if;
 return new;
end$$;
revoke all on function public.v113171_track_settlement() from public,anon,authenticated;
drop trigger if exists zz_v113171_settlement on public.v100_orders;
create trigger zz_v113171_settlement after insert or update of total,paid_amount,status
 on public.v100_orders for each row execute function public.v113171_track_settlement();

-- All consumers already use this ledger: owner, employee, exports, capacity,
-- and the commission cost component of the manager profit-base calculation.
create or replace view public.v113_commission_ledger with(security_invoker=true) as
 select order_id,order_no,employee_id,commission_type,base_amount,percent,amount,earned_at
 from public.v113171_legacy_commissions
 union all
 select s.order_id,s.order_no,s.employee_id,s.commission_type,s.base_amount,s.percent,s.amount,
 greatest(t.fully_paid_at,s.earned_at,p.effective_at) as earned_at
 from public.v113171_commission_source s
 join public.v100_orders o on o.id=s.order_id
 join public.v113171_order_settlements t on t.order_id=s.order_id
 cross join public.v113171_commission_policy p
 where o.status<>'cancelled' and o.total>0 and o.paid_amount>=o.total
 and not exists(select 1 from public.v113171_legacy_commissions l
  where l.order_id=s.order_id and l.commission_type=s.commission_type);
grant select on public.v113_commission_ledger to authenticated;

-- Preserve the original manager-base function for all pre-cutoff months.
alter table public.v113171_commission_policy add column if not exists manager_enabled_at timestamptz;
do $$declare definition text;begin
 if not exists(select 1 from public.v113171_commission_policy where manager_enabled_at is not null) then
  if exists(select 1 from public.v113_payroll_payments where payroll_month>=date '2026-11-01' and amount>0)
   or exists(select 1 from public.v113072_cash_advance_deductions where payroll_month>=date '2026-11-01' and amount>0) then
   raise exception 'SQL091 dibatalkan: periode mulai bagi hasil pengelola sudah memiliki pembayaran gaji/potongan kasbon. Jangan hapus transaksi; tentukan periode mulai yang aman.';
  end if;
 end if;
 if to_regprocedure('public.v113171_profit_base_legacy(date)') is null then
  definition:=pg_get_functiondef('public.v113151_profit_base(date)'::regprocedure);
  definition:=replace(definition,'FUNCTION public.v113151_profit_base(', 'FUNCTION public.v113171_profit_base_legacy(');
  if position('FUNCTION public.v113171_profit_base_legacy(' in definition)=0 then
   raise exception 'Tidak dapat menyimpan rumus dasar pengelola lama. Tidak ada perubahan diterapkan.';
  end if;
  execute definition;
 end if;
end$$;
revoke all on function public.v113171_profit_base_legacy(date) from public,anon,authenticated;

create or replace function public.v113151_profit_base(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare b jsonb;cutoff timestamptz;lo timestamptz;hi timestamptz;revenue numeric;
begin
 b:=public.v113171_profit_base_legacy(p_month);
 select effective_at into cutoff from public.v113171_commission_policy where singleton;
 lo:=date_trunc('month',p_month)::timestamp at time zone 'Asia/Jakarta';
 hi:=(date_trunc('month',p_month)+interval '1 month')::timestamp at time zone 'Asia/Jakarta';
 if lo<cutoff then return b;end if;
 select coalesce(sum(o.total),0) into revenue
 from public.v100_orders o join public.v113171_order_settlements t on t.order_id=o.id
 where o.created_at>=cutoff and o.total>0 and o.paid_amount>=o.total and o.status<>'cancelled'
 and greatest(t.fully_paid_at,cutoff)>=lo and greatest(t.fully_paid_at,cutoff)<hi;
 return b||jsonb_build_object('revenue',revenue,'revenue_basis','fully_paid_orders',
  'profit_base',revenue-coalesce((b->>'operating')::numeric,0)-coalesce((b->>'employee_cost')::numeric,0));
end$$;
revoke all on function public.v113151_profit_base(date) from public,anon,authenticated;
update public.v113171_commission_policy set manager_enabled_at=coalesce(manager_enabled_at,now());

-- Keep the existing share-setting authorization/validation and correct only its audit wording.
do $$declare definition text;begin
 if to_regprocedure('public.v113151_save_manager_share(date,uuid,numeric)') is not null then
  definition:=pg_get_functiondef('public.v113151_save_manager_share(date,uuid,numeric)'::regprocedure);
  definition:=replace(definition,'Dasar: order masuk - operasional - gaji/komisi; tanpa cadangan.',
   'Dasar sesuai periode: order lunas mulai November 2026, sebelumnya order masuk; dikurangi operasional dan gaji/komisi; tanpa cadangan.');
  execute definition;
 end if;
end$$;

notify pgrst,'reload schema';
commit;

-- Read-only checks. Previous periods must exactly equal the preserved snapshot.
select date_trunc('month',earned_at at time zone 'Asia/Jakarta')::date as bulan,
 commission_type,count(*) jumlah_hak_komisi,round(sum(amount)) total_komisi
from public.v113_commission_ledger group by 1,2 order by 1,2;
select count(*) as order_lunas_tanpa_bukti_tanggal_pembayaran
from public.v113171_order_settlements t join public.v113171_commission_policy p on true
where t.fully_paid_at>=p.installed_at
and not exists(select 1 from public.v100_payments x where x.order_id=t.order_id);
