-- HappyLaundry V113.0.137. Jalankan setelah SQL 071.
-- Tidak mengubah saldo lama. Batas = gaji tercatat bulan WIB berjalan,
-- dikurangi potongan kasbon bulan ini dan pembayaran gaji bulan ini.
begin;
create table if not exists public.v113137_cash_advance_approvals(
 id uuid primary key default gen_random_uuid(),
 cash_advance_id uuid not null references public.v113072_employee_cash_advances(id) on delete cascade,
 employee_id uuid not null references public.v109_users(id),
 approved_by uuid, approved_at timestamptz not null default now(),
 reason text not null check(length(btrim(reason))>=5),
 payroll_month date not null, salary_available numeric not null,
 outstanding_after numeric not null, excess numeric not null
);
alter table public.v113137_cash_advance_approvals enable row level security;
drop policy if exists owner_read on public.v113137_cash_advance_approvals;
create policy owner_read on public.v113137_cash_advance_approvals for select to authenticated using(public.v109_is_owner());
grant select on public.v113137_cash_advance_approvals to authenticated;

-- Internal only; callers below authorize access before returning salary values.
create or replace function public.v113137_salary_capacity(p_employee_id uuid)
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
revoke all on function public.v113137_salary_capacity(uuid) from public,anon,authenticated;

create or replace function public.v113137_cash_advance_limits(p_employee_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb;
begin
 if not public.v113122_can_manage_cash_advance() then raise exception 'Akses Keuangan diperlukan.'; end if;
 if p_employee_id is null and not public.v109_is_owner() then raise exception 'Hanya Owner dapat melihat seluruh batas gaji.'; end if;
 select coalesce(jsonb_agg(public.v113137_salary_capacity(u.id)||jsonb_build_object('approvals',case when public.v109_is_owner() then coalesce((select jsonb_agg(to_jsonb(a) order by a.approved_at desc) from public.v113137_cash_advance_approvals a where a.employee_id=u.id),'[]'::jsonb) else '[]'::jsonb end)),'[]'::jsonb) into v_result
 from public.v109_users u where (p_employee_id is null or u.id=p_employee_id);
 return v_result;
end; $$;
revoke all on function public.v113137_cash_advance_limits(uuid) from public,anon;
grant execute on function public.v113137_cash_advance_limits(uuid) to authenticated;

create or replace function public.v113137_guard_cash_advance()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_limit jsonb; v_after numeric; v_excess numeric; v_reason text; v_old numeric:=0;
begin
 if TG_OP='UPDATE' then
  if new.employee_id<>old.employee_id then raise exception 'Pemilik kasbon tidak boleh dipindahkan.'; end if;
  -- Pengurangan saldo, pembatalan, pengembalian potongan gaji tetap berfungsi.
  if new.amount<=old.amount and not(old.cancelled_at is not null and new.cancelled_at is null) then return new; end if;
  if old.cancelled_at is null then v_old:=old.remaining_amount; end if;
 end if;
 if new.cancelled_at is not null then return new; end if;
 -- Serialisasi input untuk karyawan yang sama agar dua pengajuan tidak lolos bersamaan.
 perform 1 from public.v109_users where id=new.employee_id for update;
 v_limit:=public.v113137_salary_capacity(new.employee_id);
 v_after:=(v_limit->>'outstanding')::numeric-v_old+new.remaining_amount;
 v_excess:=greatest(0,v_after-(v_limit->>'salary_available')::numeric);
 if v_excess>0 then
  v_reason:=btrim(coalesce(current_setting('happylaundry.cash_advance_override',true),''));
  if not public.v109_is_owner() or length(v_reason)<5 then
   raise exception 'Kasbon melebihi gaji tersedia sebesar Rp %. Hanya Owner dapat menyetujui dengan alasan minimal 5 karakter.',v_excess;
  end if;
  -- Audit mengikat row baru dengan FK deferred hingga akhir transaksi.
  insert into public.v113137_cash_advance_approvals(cash_advance_id,employee_id,approved_by,reason,payroll_month,salary_available,outstanding_after,excess)
  values(new.id,new.employee_id,auth.uid(),v_reason,(v_limit->>'payroll_month')::date,(v_limit->>'salary_available')::numeric,v_after,v_excess);
 end if;
 return new;
end; $$;
revoke all on function public.v113137_guard_cash_advance() from public,anon,authenticated;
-- BEFORE trigger memerlukan FK deferred, dan melihat saldo sebelum perubahan.
alter table public.v113137_cash_advance_approvals drop constraint if exists v113137_cash_advance_approvals_cash_advance_id_fkey;
alter table public.v113137_cash_advance_approvals add constraint v113137_cash_advance_approvals_cash_advance_id_fkey
 foreign key(cash_advance_id) references public.v113072_employee_cash_advances(id) on delete cascade deferrable initially deferred;
drop trigger if exists v113137_cash_advance_guard on public.v113072_employee_cash_advances;
create trigger v113137_cash_advance_guard before insert or update on public.v113072_employee_cash_advances
 for each row execute function public.v113137_guard_cash_advance();

create or replace function public.v113137_add_cash_advance(
 p_employee_id uuid,p_amount numeric,p_note text default null,p_payment_method text default 'cash',p_override_reason text default null,p_payroll_entry boolean default false
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not public.v113122_can_manage_cash_advance() then raise exception 'Akses Keuangan diperlukan.'; end if;
 if p_payroll_entry and not public.v109_is_owner() then raise exception 'Hanya Owner.'; end if;
 if nullif(btrim(p_override_reason),'') is not null and not public.v109_is_owner() then raise exception 'Hanya Owner dapat menyetujui kelebihan kasbon.'; end if;
 perform set_config('happylaundry.cash_advance_override',coalesce(p_override_reason,''),true);
 if p_payroll_entry then
  v_id:=public.v113072_add_cash_advance(p_employee_id,p_amount,p_note);
 else
  v_id:=public.v113122_add_cash_advance(p_employee_id,p_amount,p_note,p_payment_method);
 end if;
 perform set_config('happylaundry.cash_advance_override','',true);
 return v_id;
end; $$;
revoke all on function public.v113137_add_cash_advance(uuid,numeric,text,text,text,boolean) from public,anon;
grant execute on function public.v113137_add_cash_advance(uuid,numeric,text,text,text,boolean) to authenticated;

create or replace function public.v113137_correct_cash_advance(p_cash_advance_id uuid,p_new_amount numeric,p_new_note text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb;
begin
 if not public.v109_is_owner() then raise exception 'Hanya Owner.'; end if;
 perform set_config('happylaundry.cash_advance_override',coalesce(p_reason,''),true);
 select to_jsonb(c) into v_result from public.v113123_owner_correct_cash_advance(p_cash_advance_id,p_new_amount,p_new_note,p_reason) c;
 perform set_config('happylaundry.cash_advance_override','',true);
 return v_result;
end; $$;
revoke all on function public.v113137_correct_cash_advance(uuid,numeric,text,text) from public,anon;
grant execute on function public.v113137_correct_cash_advance(uuid,numeric,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
