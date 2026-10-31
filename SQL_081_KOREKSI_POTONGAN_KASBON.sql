-- HappyLaundry V113.0.152. Jalankan setelah SQL 080.
-- Menambahkan fasilitas; TIDAK otomatis mengoreksi data karyawan mana pun.
begin;
create table if not exists public.v113152_deduction_corrections(
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.v109_users(id),
 payroll_month date not null check(extract(day from payroll_month)=1),
 old_amount numeric(14,2) not null,new_amount numeric(14,2) not null,
 old_remaining numeric(14,2) not null,new_remaining numeric(14,2) not null,
 reason text not null check(length(btrim(reason))>=5),
 before_details jsonb not null,after_details jsonb not null,
 corrected_by uuid not null,created_at timestamptz not null default now()
);
alter table public.v113152_deduction_corrections enable row level security;
drop policy if exists owner_read on public.v113152_deduction_corrections;
create policy owner_read on public.v113152_deduction_corrections for select to authenticated using(public.v109_is_owner());
grant select on public.v113152_deduction_corrections to authenticated;
revoke insert,update,delete on public.v113152_deduction_corrections from authenticated,anon;

-- Rumus gaji lama untuk bulan yang dipilih; internal saja.
create or replace function public.v113152_salary_capacity(p_employee_id uuid,p_month date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_month date:=date_trunc('month',p_month)::date;
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
revoke all on function public.v113152_salary_capacity(uuid,date) from public,anon,authenticated;

create or replace function public.v113152_correct_payroll_deduction(
 p_employee_id uuid,p_payroll_month date,p_expected_amount numeric,p_new_amount numeric,p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_old numeric;v_debt numeric;v_new_debt numeric;v_paid numeric;v_gross numeric;
 v_left numeric;v_take numeric;v_before jsonb;v_after jsonb;v_id uuid;r record;v_loan record;
 v_capacity jsonb;v_name text;
begin
 if auth.uid() is null or not public.v109_is_owner() then raise exception 'Hanya Owner dapat mengoreksi potongan kasbon.';end if;
 if p_payroll_month is null or extract(day from p_payroll_month)<>1 then raise exception 'Pilih bulan gaji yang valid.';end if;
 if p_employee_id is null or p_expected_amount is null or p_new_amount is null
 or p_new_amount::text in ('NaN','Infinity','-Infinity') or p_expected_amount::text in ('NaN','Infinity','-Infinity')
 or p_new_amount<0 or p_new_amount<>round(p_new_amount,2) then raise exception 'Nominal potongan harus valid, minimal Rp0, maksimal dua angka desimal.';end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Alasan koreksi minimal 5 karakter.';end if;

 -- Writer lama belum memakai advisory lock; lock singkat ini juga menyerialkan
 -- penambahan kasbon, potongan, serta pembayaran gaji yang sedang berjalan.
 lock table public.v113072_employee_cash_advances,
 public.v113072_cash_advance_deductions,public.v113_payroll_payments in exclusive mode;
 select full_name into v_name from public.v109_users where id=p_employee_id;
 if v_name is null then raise exception 'Karyawan tidak ditemukan.';end if;
 select coalesce(sum(amount),0) into v_old from public.v113072_cash_advance_deductions
 where employee_id=p_employee_id and payroll_month=p_payroll_month;
 if v_old<>p_expected_amount then raise exception 'Potongan sudah berubah dari perangkat lain. Tutup dialog, muat ulang, lalu koreksi lagi.';end if;
 select coalesce(sum(amount),0) into v_paid from public.v113_payroll_payments
 where employee_id=p_employee_id and payroll_month=p_payroll_month;
 if v_paid<>0 then raise exception 'Gaji bulan ini sudah memiliki pembayaran. Koreksi potongan hanya untuk gaji yang belum dibayar.';end if;
 if p_new_amount=v_old then raise exception 'Nominal potongan belum berubah.';end if;
 select coalesce(sum(remaining_amount),0) into v_debt from public.v113072_employee_cash_advances
 where employee_id=p_employee_id and cancelled_at is null;
 if exists(select 1 from public.v113072_cash_advance_deductions d
 join public.v113072_employee_cash_advances a on a.id=d.cash_advance_id
 where d.employee_id=p_employee_id and d.payroll_month=p_payroll_month
 and (a.employee_id<>p_employee_id or a.cancelled_at is not null)) then
 raise exception 'Hubungan potongan dengan pinjaman perlu diperiksa terlebih dahulu.';end if;

 if p_new_amount>v_old then
  v_capacity:=public.v113152_salary_capacity(p_employee_id,p_payroll_month);
  v_gross:=(v_capacity->>'gross')::numeric+public.v113151_manager_amount(p_employee_id,p_payroll_month);
  if p_new_amount>greatest(0,v_gross) then raise exception 'Potongan baru melebihi gaji kotor tersimpan Rp %. Simpan perubahan gaji dahulu.',v_gross;end if;
  if p_new_amount-v_old>v_debt then raise exception 'Tambahan potongan melebihi sisa utang kasbon Rp %.',v_debt;end if;
 end if;
 select jsonb_build_object(
 'deductions',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at,d.id) from public.v113072_cash_advance_deductions d where d.employee_id=p_employee_id and d.payroll_month=p_payroll_month),'[]'),
 'loans',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.v113072_employee_cash_advances a where a.employee_id=p_employee_id),'[]')) into v_before;

 if p_new_amount<v_old then
  v_left:=v_old-p_new_amount;
  for r in select * from public.v113072_cash_advance_deductions
   where employee_id=p_employee_id and payroll_month=p_payroll_month order by created_at desc,id desc
  loop
   exit when v_left<=0;
   v_take:=least(v_left,r.amount);
   select * into strict v_loan from public.v113072_employee_cash_advances where id=r.cash_advance_id;
   if v_loan.remaining_amount+v_take>v_loan.amount then raise exception 'Saldo hasil koreksi melebihi nilai pinjaman. Semua perubahan dibatalkan.';end if;
   update public.v113072_employee_cash_advances set remaining_amount=remaining_amount+v_take where id=r.cash_advance_id;
   if v_take=r.amount then delete from public.v113072_cash_advance_deductions where id=r.id;
   else update public.v113072_cash_advance_deductions set amount=amount-v_take where id=r.id;end if;
   v_left:=v_left-v_take;
  end loop;
 else
  v_left:=p_new_amount-v_old;
  for r in select * from public.v113072_employee_cash_advances
   where employee_id=p_employee_id and cancelled_at is null and remaining_amount>0 order by issued_at,id
  loop
   exit when v_left<=0;
   v_take:=least(v_left,r.remaining_amount);
   update public.v113072_employee_cash_advances set remaining_amount=remaining_amount-v_take where id=r.id;
   insert into public.v113072_cash_advance_deductions(cash_advance_id,employee_id,payroll_month,amount)
    values(r.id,p_employee_id,p_payroll_month,v_take);
   v_left:=v_left-v_take;
  end loop;
 end if;
 select coalesce(sum(remaining_amount),0) into v_new_debt from public.v113072_employee_cash_advances where employee_id=p_employee_id and cancelled_at is null;
 if v_left<>0 or v_new_debt<>v_debt+v_old-p_new_amount
 or (select coalesce(sum(amount),0) from public.v113072_cash_advance_deductions where employee_id=p_employee_id and payroll_month=p_payroll_month)<>p_new_amount then
 raise exception 'Validasi saldo gagal. Semua perubahan dibatalkan.';end if;
 select jsonb_build_object(
 'deductions',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at,d.id) from public.v113072_cash_advance_deductions d where d.employee_id=p_employee_id and d.payroll_month=p_payroll_month),'[]'),
 'loans',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.v113072_employee_cash_advances a where a.employee_id=p_employee_id),'[]')) into v_after;
 insert into public.v113152_deduction_corrections(employee_id,payroll_month,old_amount,new_amount,old_remaining,new_remaining,reason,before_details,after_details,corrected_by)
 values(p_employee_id,p_payroll_month,v_old,p_new_amount,v_debt,v_new_debt,btrim(p_reason),v_before,v_after,auth.uid()) returning id into v_id;
 insert into public.v109_audit_log(employee_id,full_name,action,entity_type,entity_id,details)
 values(p_employee_id,v_name,'OWNER_CASH_DEDUCTION_CORRECTION','payroll',p_payroll_month::text,
 format('Koreksi potongan kasbon Rp %s menjadi Rp %s. Sisa utang Rp %s menjadi Rp %s. Alasan: %s. Audit: %s',v_old,p_new_amount,v_debt,v_new_debt,btrim(p_reason),v_id));
 return jsonb_build_object('id',v_id,'old_amount',v_old,'new_amount',p_new_amount,'new_remaining',v_new_debt,'payroll_month',p_payroll_month);
end;$$;
revoke all on function public.v113152_correct_payroll_deduction(uuid,date,numeric,numeric,text) from public,anon;
grant execute on function public.v113152_correct_payroll_deduction(uuid,date,numeric,numeric,text) to authenticated;
notify pgrst,'reload schema';
commit;
