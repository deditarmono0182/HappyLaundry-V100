-- HappyLaundry V113.0.163. Jalankan setelah SQL 072, 073, 083, dan 084.
-- Migrasi ini tidak memberikan kasbon atau mengubah saldo yang sudah ada.
begin;
create table if not exists public.v113163_cash_advance_addition_requests(
 id uuid primary key,employee_id uuid not null references public.v109_users(id),employee_name text not null,
 amount numeric(14,2) not null check(amount>0),payment_method text not null check(payment_method in('cash','transfer','qris','other')),
 note text,reason text not null check(length(btrim(reason))>=5),capacity_at_request jsonb not null,
 status text not null default 'pending' check(status in('pending','approved','rejected')),
 requested_by uuid not null,requester_name text not null,requested_at timestamptz not null default now(),
 reviewed_by uuid,reviewer_name text,reviewed_at timestamptz,review_note text,
 capacity_at_review jsonb,cash_advance_id uuid references public.v113072_employee_cash_advances(id)
);
alter table public.v113163_cash_advance_addition_requests enable row level security;
drop policy if exists v113163_finance_read on public.v113163_cash_advance_addition_requests;
create policy v113163_finance_read on public.v113163_cash_advance_addition_requests for select to authenticated
 using(public.v113122_can_manage_cash_advance());
grant select on public.v113163_cash_advance_addition_requests to authenticated;
revoke insert,update,delete on public.v113163_cash_advance_addition_requests from authenticated,anon;

create or replace function public.v113163_request_additional_cash_advance(
 p_request_id uuid,p_employee_id uuid,p_amount numeric,p_payment_method text,p_note text,p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.v113163_cash_advance_addition_requests%rowtype;v_name text;v_requester text;
 v_note text:=nullif(btrim(coalesce(p_note,'')),'');v_reason text:=btrim(coalesce(p_reason,''));
 v_method text:=lower(btrim(coalesce(p_payment_method,'')));v_capacity jsonb;
begin
 if auth.uid() is null or not public.v113122_can_manage_cash_advance() then raise exception 'Akses Keuangan diperlukan';end if;
 if p_request_id is null then raise exception 'ID pengajuan wajib diisi';end if;
 if p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2) or p_amount::text in('NaN','Infinity','-Infinity') then raise exception 'Nominal pengajuan tidak valid';end if;
 if v_method not in('cash','transfer','qris','other') then raise exception 'Metode pemberian tidak valid';end if;
 if length(v_reason)<5 then raise exception 'Alasan pengajuan minimal 5 karakter';end if;
 -- Serialize inserts/retries; no financial table is modified by a request.
 lock table public.v113163_cash_advance_addition_requests in share row exclusive mode;
 select * into r from public.v113163_cash_advance_addition_requests where id=p_request_id;
 if found then
  if r.requested_by=auth.uid() and r.employee_id=p_employee_id and r.amount=p_amount
   and r.payment_method=v_method and r.note is not distinct from v_note and r.reason=v_reason then return to_jsonb(r);end if;
  raise exception 'ID pengajuan sudah digunakan dengan data berbeda';
 end if;
 select full_name into v_name from public.v109_users where id=p_employee_id and is_active=true;
 if not found then raise exception 'Karyawan tidak ditemukan atau sudah nonaktif';end if;
 v_capacity:=public.v113137_salary_capacity(p_employee_id);
 select e.full_name into v_requester from public.v109_current_employee() e limit 1;
 if v_requester is null then select full_name into v_requester from public.profiles where id=auth.uid();end if;
 insert into public.v113163_cash_advance_addition_requests(id,employee_id,employee_name,amount,payment_method,note,reason,capacity_at_request,requested_by,requester_name)
 values(p_request_id,p_employee_id,v_name,p_amount,v_method,v_note,v_reason,v_capacity,auth.uid(),coalesce(v_requester,'Owner')) returning * into r;
 return to_jsonb(r);
end;$$;

create or replace function public.v113163_review_additional_cash_advance(p_request_id uuid,p_approve boolean,p_review_note text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.v113163_cash_advance_addition_requests%rowtype;v_name text;v_capacity jsonb;v_loan uuid;
 v_reason text:=btrim(coalesce(p_review_note,''));
begin
 if auth.uid() is null or not public.v109_is_owner() then raise exception 'Hanya Owner dapat memutuskan pengajuan tambahan kasbon';end if;
 if p_approve is null or length(v_reason)<5 then raise exception 'Catatan keputusan minimal 5 karakter';end if;
 -- Same order as correction, repayment and salary cancellation. Approval is atomic.
 lock table public.v113072_employee_cash_advances,public.v113072_cash_advance_deductions,public.v113_payroll_payments in exclusive mode;
 select * into r from public.v113163_cash_advance_addition_requests where id=p_request_id for update;
 if not found then raise exception 'Pengajuan tidak ditemukan';end if;
 if r.status<>'pending' then
  if r.status=(case when p_approve then 'approved' else 'rejected' end) then return to_jsonb(r);end if;
  raise exception 'Pengajuan sudah diputuskan';
 end if;
 select full_name into v_name from public.profiles where id=auth.uid();
 if p_approve then
  perform 1 from public.v109_users where id=r.employee_id and is_active=true for update;
  if not found then raise exception 'Karyawan sudah nonaktif. Tolak pengajuan ini';end if;
  v_capacity:=public.v113137_salary_capacity(r.employee_id);
  -- Reuse the original guard and its over-salary approval audit; cash-out is recorded once.
  v_loan:=public.v113137_add_cash_advance(r.employee_id,r.amount,r.note,r.payment_method,
   'Pengajuan tambahan '||r.id::text||': '||r.reason||' | Persetujuan Owner: '||v_reason,false);
 end if;
 update public.v113163_cash_advance_addition_requests set status=case when p_approve then 'approved' else 'rejected' end,
  reviewed_by=auth.uid(),reviewer_name=coalesce(v_name,'Owner'),reviewed_at=now(),review_note=v_reason,
  capacity_at_review=v_capacity,cash_advance_id=v_loan where id=r.id returning * into r;
 return to_jsonb(r);
end;$$;
revoke all on function public.v113163_request_additional_cash_advance(uuid,uuid,numeric,text,text,text) from public,anon;
revoke all on function public.v113163_review_additional_cash_advance(uuid,boolean,text) from public,anon;
grant execute on function public.v113163_request_additional_cash_advance(uuid,uuid,numeric,text,text,text) to authenticated;
grant execute on function public.v113163_review_additional_cash_advance(uuid,boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;
