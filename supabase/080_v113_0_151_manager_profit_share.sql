-- HappyLaundry V113.0.151 — jalankan setelah 079. Tidak mengubah login/GPS.
begin;
create table if not exists public.v113151_manager_shares(
 payroll_month date not null check(extract(day from payroll_month)=1),
 employee_id uuid not null references public.v109_users(id),
 share_percent numeric(7,4) not null check(share_percent>=0 and share_percent<=100),
 updated_at timestamptz not null default now(), updated_by uuid,
 primary key(payroll_month,employee_id)
);
alter table public.v113151_manager_shares enable row level security;
drop policy if exists owner_read on public.v113151_manager_shares;
create policy owner_read on public.v113151_manager_shares for select to authenticated using(public.v109_is_owner());
grant select on public.v113151_manager_shares to authenticated;
revoke insert,update,delete on public.v113151_manager_shares from authenticated,anon;

-- Agregasi server: tidak dibatasi 1.000 baris API. Semua biaya hak karyawan,
-- termasuk gaji biasa pengelola, dikurangi tepat sekali. Tidak membaca cadangan,
-- kasbon, pembayaran gaji, atau bagi hasil pengelola itu sendiri.
create or replace function public.v113151_profit_base(p_month date)
returns jsonb language sql stable security definer set search_path=public as $$
 with bounds as (
 select date_trunc('month',p_month)::date m,
 date_trunc('month',p_month)::timestamp at time zone 'Asia/Jakarta' lo,
 (date_trunc('month',p_month)+interval '1 month')::timestamp at time zone 'Asia/Jakarta' hi
 ), orders as (
 select o.id,greatest(0,o.total) total from public.v100_orders_view o,bounds b
 where o.status<>'cancelled' and o.created_at>=b.lo and o.created_at<b.hi
 ), items as (
 select i.*,sum(greatest(0,i.subtotal)) over(partition by i.order_id) item_total
 from public.v100_order_items i join orders o on o.id=i.order_id
 ), category_values as (
 select coalesce(nullif(btrim(s.category),''),'Kiloan') category,
 o.total*greatest(0,i.subtotal)/i.item_total revenue
 from orders o join items i on i.order_id=o.id left join public.v100_services s on s.id=i.service_id
 where i.item_total>0 and i.subtotal>0
 union all select 'Kiloan',o.total from orders o
 where not exists(select 1 from items i where i.order_id=o.id and i.subtotal>0)
 ), amounts as (
 select coalesce((select sum(total) from orders),0) revenue,
 coalesce((select sum(e.amount) from public.v106_expenses_view e,bounds b
 where e.expense_date>=b.m and e.expense_date<(b.m+interval '1 month')::date
 and lower(coalesce(e.category_name,'')||' '||coalesce(e.group_name,'')) !~ '(gaji|payroll|komisi|tunjangan|bonus|bagi hasil|sdm|cadangan)'),0) operating,
 coalesce((select sum(s.attendance_rate) from public.v111_attendance a
 join public.v111_employee_payroll_settings s on s.employee_id=a.employee_id,bounds b
 where a.status='present' and a.attendance_date>=b.m and a.attendance_date<(b.m+interval '1 month')::date),0)
 +coalesce((select sum(monthly_allowance) from public.v111_employee_payroll_settings),0)
 +coalesce((select sum(a.bonus) from public.v111_payroll_adjustments a,bounds b where a.payroll_month=b.m),0)
 +coalesce((select sum(c.revenue*s.share_percent/100.0) from category_values c join public.v111_employee_revenue_shares s on s.category=c.category),0)
 +coalesce((select sum(c.amount) from public.v113_commission_ledger c,bounds b where c.earned_at>=b.lo and c.earned_at<b.hi),0) employee_cost
 ) select jsonb_build_object('revenue',revenue,'operating',operating,'employee_cost',employee_cost,'profit_base',revenue-operating-employee_cost) from amounts;
$$;
revoke all on function public.v113151_profit_base(date) from public,anon,authenticated;

create or replace function public.v113151_manager_amount(p_employee uuid,p_month date)
returns numeric language sql stable security definer set search_path=public as $$
 select round(greatest(0,(public.v113151_profit_base(p_month)->>'profit_base')::numeric)
 *coalesce((select share_percent from public.v113151_manager_shares where employee_id=p_employee and payroll_month=date_trunc('month',p_month)::date),0)/100.0,2);
$$;
revoke all on function public.v113151_manager_amount(uuid,date) from public,anon,authenticated;

create or replace function public.v113151_manager_report(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_base jsonb;v_rows jsonb;
begin
 if auth.uid() is null or not public.v113122_can_manage_cash_advance() then raise exception 'Akses Keuangan diperlukan.';end if;
 if p_month is null then raise exception 'Pilih bulan.';end if;
 v_base:=public.v113151_profit_base(p_month);
 select coalesce(jsonb_agg(jsonb_build_object('employee_id',s.employee_id,'full_name',u.full_name,
 'percent',s.share_percent,'amount',round(greatest(0,(v_base->>'profit_base')::numeric)*s.share_percent/100.0,2),'updated_at',s.updated_at) order by u.full_name),'[]') into v_rows
 from public.v113151_manager_shares s join public.v109_users u on u.id=s.employee_id
 where s.payroll_month=date_trunc('month',p_month)::date;
 return v_base||jsonb_build_object('payroll_month',date_trunc('month',p_month)::date,'rows',v_rows);
end;$$;
revoke all on function public.v113151_manager_report(date) from public,anon;
grant execute on function public.v113151_manager_report(date) to authenticated;

create or replace function public.v113151_save_manager_share(p_month date,p_employee uuid,p_percent numeric)
returns void language plpgsql security definer set search_path=public as $$
declare v_old numeric;v_name text;
begin
 if auth.uid() is null or not public.v109_is_owner() then raise exception 'Hanya Owner.';end if;
 if p_month is null or p_employee is null or p_percent is null or p_percent<0 or p_percent>100 or p_percent='NaN'::numeric then raise exception 'Karyawan, bulan, dan persentase 0–100 wajib valid.';end if;
 perform pg_advisory_xact_lock(113151,extract(year from p_month)::int*100+extract(month from p_month)::int);
 select full_name into v_name from public.v109_users where id=p_employee and is_active=true;
 if v_name is null then raise exception 'Pilih karyawan aktif.';end if;
 if p_percent+coalesce((select sum(share_percent) from public.v113151_manager_shares where payroll_month=date_trunc('month',p_month)::date and employee_id<>p_employee),0)>100 then raise exception 'Total bagian pengelola tidak boleh melebihi 100%%.';end if;
 select share_percent into v_old from public.v113151_manager_shares where payroll_month=date_trunc('month',p_month)::date and employee_id=p_employee;
 insert into public.v113151_manager_shares(payroll_month,employee_id,share_percent,updated_by)
 values(date_trunc('month',p_month)::date,p_employee,p_percent,auth.uid())
 on conflict(payroll_month,employee_id) do update set share_percent=excluded.share_percent,updated_by=excluded.updated_by,updated_at=now();
 insert into public.v109_audit_log(employee_id,full_name,action,entity_type,entity_id,details)
 values(p_employee,v_name,'OWNER_MANAGER_SHARE','payroll',to_char(p_month,'YYYY-MM'),
 format('Owner %s mengubah bagian pengelola dari %s%% menjadi %s%%. Dasar: order masuk - operasional - gaji/komisi; tanpa cadangan.',auth.uid(),coalesce(v_old,0),p_percent));
end;$$;
revoke all on function public.v113151_save_manager_share(date,uuid,numeric) from public,anon;
grant execute on function public.v113151_save_manager_share(date,uuid,numeric) to authenticated;

-- Karyawan hanya memperoleh nominal/persen miliknya; laba usaha tidak dibuka.
create or replace function public.v113151_my_manager_share(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_employee uuid;v_percent numeric;
begin
 if auth.uid() is null then raise exception 'Silakan login.';end if;
 select id into v_employee from public.v109_current_employee() limit 1;
 if v_employee is null then raise exception 'Akun karyawan aktif diperlukan.';end if;
 select share_percent into v_percent from public.v113151_manager_shares where employee_id=v_employee and payroll_month=date_trunc('month',p_month)::date;
 return jsonb_build_object('percent',coalesce(v_percent,0),'amount',case when coalesce(v_percent,0)>0 then public.v113151_manager_amount(v_employee,p_month) else 0 end);
end;$$;
revoke all on function public.v113151_my_manager_share(date) from public,anon;
grant execute on function public.v113151_my_manager_share(date) to authenticated;

-- Pertahankan rumus kasbon lama dan tambahkan komponen pengelola.
create or replace function public.v113151_salary_capacity_base(p_employee_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_month date:=date_trunc('month',now() at time zone 'Asia/Jakarta')::date;
 v_start timestamptz; v_end timestamptz;
 v_gross numeric; v_share numeric; v_applied numeric; v_paid numeric; v_debt numeric; v_available numeric;
begin
 v_start:=v_month::timestamp at time zone 'Asia/Jakarta';
 v_end:=(v_month+interval '1 month')::timestamp at time zone 'Asia/Jakarta';
 with monthly_orders as (
  select id,greatest(0,total) total from public.v100_orders_view
  where created_at>=v_start and created_at<v_end and status<>'cancelled'
 ), category_values as (
  select coalesce(nullif(btrim(s.category),''),'Kiloan') category,
    o.total*greatest(0,oi.subtotal)/t.item_total revenue
  from monthly_orders o
  join public.v100_order_items oi on oi.order_id=o.id
  left join public.v100_services s on s.id=oi.service_id
  join lateral (select sum(greatest(0,x.subtotal)) item_total from public.v100_order_items x where x.order_id=o.id) t on t.item_total>0
  where oi.subtotal>0
  union all
  select 'Kiloan',o.total from monthly_orders o
  where not exists(select 1 from public.v100_order_items x where x.order_id=o.id and x.subtotal>0)
 )
 select coalesce(sum(rs.share_percent/100.0*c.revenue),0) into v_share
 from public.v111_employee_revenue_shares rs join category_values c on c.category=rs.category
 where rs.employee_id=p_employee_id;
 select
  coalesce((select attendance_rate from public.v111_employee_payroll_settings where employee_id=p_employee_id),0)
   *(select count(*) from public.v111_attendance where employee_id=p_employee_id and status='present' and attendance_date>=v_month and attendance_date<(v_month+interval '1 month')::date)
  +coalesce((select monthly_allowance from public.v111_employee_payroll_settings where employee_id=p_employee_id),0)
  +coalesce((select sum(bonus) from public.v111_payroll_adjustments where employee_id=p_employee_id and payroll_month=v_month),0)
  +coalesce((select sum(amount) from public.v113_commission_ledger where employee_id=p_employee_id and earned_at>=v_start and earned_at<v_end),0)
  +v_share into v_gross;
 select coalesce(sum(amount),0) into v_applied from public.v113072_cash_advance_deductions where employee_id=p_employee_id and payroll_month=v_month;
 select coalesce(sum(amount),0) into v_paid from public.v113_payroll_payments where employee_id=p_employee_id and payroll_month=v_month;
 select coalesce(sum(remaining_amount),0) into v_debt from public.v113072_employee_cash_advances where employee_id=p_employee_id and cancelled_at is null;
 v_available:=greatest(0,v_gross-v_applied-v_paid);
 return jsonb_build_object('employee_id',p_employee_id,'payroll_month',v_month,'gross',v_gross,'deductions',v_applied,'salary_paid',v_paid,
 'salary_available',v_available,'outstanding',v_debt,'excess',greatest(0,v_debt-v_available));
end; $$;
revoke all on function public.v113151_salary_capacity_base(uuid) from public,anon,authenticated;

create or replace function public.v113137_salary_capacity(p_employee_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b jsonb;g numeric;a numeric;d numeric;
begin
 b:=public.v113151_salary_capacity_base(p_employee_id);
 g:=(b->>'gross')::numeric+public.v113151_manager_amount(p_employee_id,(b->>'payroll_month')::date);
 a:=greatest(0,g-(b->>'deductions')::numeric-(b->>'salary_paid')::numeric);
 d:=(b->>'outstanding')::numeric;
 return b||jsonb_build_object('gross',g,'salary_available',a,'excess',greatest(0,d-a));
end;$$;
revoke all on function public.v113137_salary_capacity(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
