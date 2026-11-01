-- HappyLaundry V113.0.162. No payment is cancelled by running this migration.
begin;
create table if not exists public.v113162_payroll_payment_cancellations(
 id uuid primary key,employee_id uuid not null references public.v109_users(id),employee_name text not null,
 payroll_month date not null,total_amount numeric(14,2) not null check(total_amount>0),
 payment_ids uuid[] not null,payments jsonb not null,reason text not null check(length(btrim(reason))>=5),
 cancelled_by uuid not null,cancelled_at timestamptz not null default now()
);
alter table public.v113162_payroll_payment_cancellations enable row level security;
drop policy if exists v113162_cancellation_read on public.v113162_payroll_payment_cancellations;
create policy v113162_cancellation_read on public.v113162_payroll_payment_cancellations for select to authenticated using(
 public.v109_is_owner() or employee_id=(select id from public.v109_current_employee() limit 1));
grant select on public.v113162_payroll_payment_cancellations to authenticated;
revoke insert,update,delete on public.v113162_payroll_payment_cancellations from authenticated,anon;

create or replace function public.v113162_cancel_payroll_payments(
 p_request_id uuid,p_employee_id uuid,p_payroll_month date,p_expected_total numeric,p_expected_ids uuid[],p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.v113162_payroll_payment_cancellations%rowtype;v_total numeric;v_ids uuid[];v_expected uuid[];v_rows jsonb;v_name text;v_reason text:=btrim(coalesce(p_reason,''));
begin
 if auth.uid() is null or not public.v109_is_owner() then raise exception 'Hanya Owner dapat membatalkan pembayaran gaji';end if;
 if p_request_id is null or p_employee_id is null or p_payroll_month is null or p_payroll_month<>date_trunc('month',p_payroll_month)::date then raise exception 'ID pengajuan, karyawan dan bulan gaji tidak valid';end if;
 if length(v_reason)<5 then raise exception 'Alasan pembatalan minimal 5 karakter';end if;
 select array_agg(x order by x) into v_expected from unnest(p_expected_ids) x;
 lock table public.v113072_employee_cash_advances,public.v113072_cash_advance_deductions,public.v113_payroll_payments in exclusive mode;
 select * into r from public.v113162_payroll_payment_cancellations where id=p_request_id for update;
 if found then
  if r.cancelled_by=auth.uid() and r.employee_id=p_employee_id and r.payroll_month=p_payroll_month and r.total_amount=p_expected_total and r.payment_ids=v_expected and r.reason=v_reason then return to_jsonb(r);end if;
  raise exception 'ID pembatalan sudah dipakai dengan data berbeda';
 end if;
 select coalesce(sum(amount),0),array_agg(id order by id),jsonb_agg(to_jsonb(p) order by paid_at,id)
 into v_total,v_ids,v_rows from public.v113_payroll_payments p where employee_id=p_employee_id and payroll_month=p_payroll_month;
 if v_total<=0 then raise exception 'Tidak ada pembayaran aktif untuk dibatalkan';end if;
 if v_total is distinct from p_expected_total or v_ids is distinct from v_expected then raise exception 'Riwayat pembayaran berubah. Muat ulang sebelum membatalkan';end if;
 select full_name into v_name from public.v109_users where id=p_employee_id;
 if not found then raise exception 'Karyawan tidak ditemukan';end if;
 -- Preserve the complete original records before removing them from the active payment ledger.
 -- Existing salary, capacity and employee payroll functions therefore all read the same active sum.
 insert into public.v113162_payroll_payment_cancellations(id,employee_id,employee_name,payroll_month,total_amount,payment_ids,payments,reason,cancelled_by)
 values(p_request_id,p_employee_id,v_name,p_payroll_month,v_total,v_ids,v_rows,v_reason,auth.uid()) returning * into r;
 delete from public.v113_payroll_payments where employee_id=p_employee_id and payroll_month=p_payroll_month and id=any(v_ids);
 return to_jsonb(r);
end;$$;
revoke all on function public.v113162_cancel_payroll_payments(uuid,uuid,date,numeric,uuid[],text) from public,anon;
grant execute on function public.v113162_cancel_payroll_payments(uuid,uuid,date,numeric,uuid[],text) to authenticated;
notify pgrst,'reload schema';
commit;
