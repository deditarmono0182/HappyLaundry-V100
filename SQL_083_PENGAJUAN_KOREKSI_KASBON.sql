-- HappyLaundry V113.0.161. Run after SQL 067, 072, 073, 081, 082.
-- No existing loan or salary is changed by this migration.
begin;
create table if not exists public.v113161_cash_advance_requests(
 id uuid primary key, cash_advance_id uuid not null references public.v113072_employee_cash_advances(id),
 employee_id uuid not null references public.v109_users(id),employee_name text not null,
 old_amount numeric(14,2) not null,old_remaining numeric(14,2) not null,old_note text,
 new_amount numeric(14,2) not null check(new_amount>0),new_note text,reason text not null,
 status text not null default 'pending' check(status in('pending','approved','rejected','stale')),
 requested_by uuid not null,requester_name text not null,requested_at timestamptz not null default now(),
 reviewed_by uuid,reviewer_name text,reviewed_at timestamptz,review_note text,result jsonb
);
create unique index if not exists v113161_one_pending_loan on public.v113161_cash_advance_requests(cash_advance_id) where status='pending';
alter table public.v113161_cash_advance_requests enable row level security;
drop policy if exists v113161_finance_read on public.v113161_cash_advance_requests;
create policy v113161_finance_read on public.v113161_cash_advance_requests for select to authenticated using(public.v113122_can_manage_cash_advance());
grant select on public.v113161_cash_advance_requests to authenticated;
revoke insert,update,delete on public.v113161_cash_advance_requests from authenticated,anon;

create or replace function public.v113161_request_cash_advance_correction(
 p_request_id uuid,p_cash_advance_id uuid,p_expected_amount numeric,p_expected_remaining numeric,p_expected_note text,
 p_new_amount numeric,p_new_note text,p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.v113072_employee_cash_advances%rowtype;r public.v113161_cash_advance_requests%rowtype;
 v_name text;v_requester text;v_note text:=nullif(btrim(coalesce(p_new_note,'')),'');v_reason text:=btrim(coalesce(p_reason,''));
begin
 if auth.uid() is null or not public.v113122_can_manage_cash_advance() then raise exception 'Akses Keuangan diperlukan';end if;
 if p_request_id is null then raise exception 'ID pengajuan wajib diisi';end if;
 select * into r from public.v113161_cash_advance_requests where id=p_request_id;
 if found then
  if r.requested_by=auth.uid() and r.cash_advance_id=p_cash_advance_id and r.new_amount=p_new_amount
   and r.new_note is not distinct from v_note and r.reason=v_reason then return to_jsonb(r);end if;
  raise exception 'ID pengajuan sudah dipakai dengan data berbeda';
 end if;
 if p_new_amount is null or p_new_amount<=0 or p_new_amount<>round(p_new_amount,2) or p_new_amount::text in('NaN','Infinity','-Infinity') then raise exception 'Nominal baru tidak valid';end if;
 if length(v_reason)<5 then raise exception 'Alasan minimal 5 karakter';end if;
 select * into a from public.v113072_employee_cash_advances where id=p_cash_advance_id for update;
 if not found or a.cancelled_at is not null then raise exception 'Kasbon tidak ditemukan atau sudah dibatalkan';end if;
 -- Recheck the key after the loan lock for simultaneous retries.
 select * into r from public.v113161_cash_advance_requests where id=p_request_id;
 if found then
  if r.requested_by=auth.uid() and r.cash_advance_id=p_cash_advance_id and r.new_amount=p_new_amount and r.new_note is not distinct from v_note and r.reason=v_reason then return to_jsonb(r);end if;
  raise exception 'ID pengajuan sudah dipakai';
 end if;
 if a.amount is distinct from p_expected_amount or a.remaining_amount is distinct from p_expected_remaining or a.note is distinct from p_expected_note then raise exception 'Data kasbon berubah. Muat ulang rincian terlebih dahulu';end if;
 if a.amount=p_new_amount and a.note is not distinct from v_note then raise exception 'Tidak ada perubahan untuk diajukan';end if;
 if p_new_amount<a.amount-a.remaining_amount then raise exception 'Nominal baru lebih kecil dari jumlah yang sudah dipotong/dibayar';end if;
 if exists(select 1 from public.v113072_cash_advance_deductions d join public.v113_payroll_payments p on p.employee_id=d.employee_id and p.payroll_month=d.payroll_month where d.cash_advance_id=a.id and p.amount>0) then raise exception 'Kasbon terkait gaji yang sudah dibayarkan. Perlu pemeriksaan khusus Owner';end if;
 if exists(select 1 from public.v113161_cash_advance_requests where cash_advance_id=a.id and status='pending') then raise exception 'Kasbon ini sudah memiliki pengajuan yang menunggu Owner';end if;
 select full_name into v_name from public.v109_users where id=a.employee_id;
 select e.full_name into v_requester from public.v109_current_employee() e limit 1;
 if v_requester is null then select full_name into v_requester from public.profiles where id=auth.uid();end if;
 insert into public.v113161_cash_advance_requests(id,cash_advance_id,employee_id,employee_name,old_amount,old_remaining,old_note,new_amount,new_note,reason,requested_by,requester_name)
 values(p_request_id,a.id,a.employee_id,coalesce(v_name,'Karyawan'),a.amount,a.remaining_amount,a.note,p_new_amount,v_note,v_reason,auth.uid(),coalesce(v_requester,'Owner')) returning * into r;
 return to_jsonb(r);
end;$$;

create or replace function public.v113161_review_cash_advance_correction(p_request_id uuid,p_approve boolean,p_review_note text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.v113161_cash_advance_requests%rowtype;a public.v113072_employee_cash_advances%rowtype;
 v_note text:=btrim(coalesce(p_review_note,''));v_name text;v_result jsonb;v_stale text;
begin
 if auth.uid() is null or not public.v109_is_owner() then raise exception 'Hanya Owner dapat memutuskan koreksi kasbon';end if;
 if p_approve is null or length(v_note)<5 then raise exception 'Catatan keputusan minimal 5 karakter';end if;
 -- Same order as salary correction/repayment workflows. The validation and correction are atomic.
 lock table public.v113072_employee_cash_advances,public.v113072_cash_advance_deductions,public.v113_payroll_payments in exclusive mode;
 select * into r from public.v113161_cash_advance_requests where id=p_request_id for update;
 if not found then raise exception 'Pengajuan tidak ditemukan';end if;
 if r.status<>'pending' then
  if r.status='stale' or r.status=(case when p_approve then 'approved' else 'rejected' end) then return to_jsonb(r);end if;
  raise exception 'Pengajuan sudah diputuskan';
 end if;
 select full_name into v_name from public.profiles where id=auth.uid();
 if p_approve then
  select * into a from public.v113072_employee_cash_advances where id=r.cash_advance_id for update;
  if not found or a.cancelled_at is not null then v_stale:='Kasbon sudah dibatalkan atau tidak tersedia';
  elsif a.amount is distinct from r.old_amount or a.remaining_amount is distinct from r.old_remaining or a.note is distinct from r.old_note then v_stale:='Data kasbon berubah setelah pengajuan. Ajukan ulang dengan data terbaru';
  elsif exists(select 1 from public.v113072_cash_advance_deductions d join public.v113_payroll_payments p on p.employee_id=d.employee_id and p.payroll_month=d.payroll_month where d.cash_advance_id=a.id and p.amount>0) then v_stale:='Gaji terkait sudah dibayarkan. Perlu pemeriksaan khusus Owner';end if;
  if v_stale is null then
   -- Reuse owner correction, salary-capacity warning/audit, and existing cash adjustment exactly once.
   v_result:=public.v113137_correct_cash_advance(r.cash_advance_id,r.new_amount,r.new_note,
     'Pengajuan '||r.id::text||': '||r.reason||' | Persetujuan Owner: '||v_note);
  end if;
 end if;
 update public.v113161_cash_advance_requests set status=case when v_stale is not null then 'stale' when p_approve then 'approved' else 'rejected' end,
  reviewed_by=auth.uid(),reviewer_name=coalesce(v_name,'Owner'),reviewed_at=now(),review_note=coalesce(v_stale||' | ','')||v_note,result=v_result
 where id=r.id returning * into r;
 return to_jsonb(r);
end;$$;
revoke all on function public.v113161_request_cash_advance_correction(uuid,uuid,numeric,numeric,text,numeric,text,text) from public,anon;
revoke all on function public.v113161_review_cash_advance_correction(uuid,boolean,text) from public,anon;
grant execute on function public.v113161_request_cash_advance_correction(uuid,uuid,numeric,numeric,text,numeric,text,text) to authenticated;
grant execute on function public.v113161_review_cash_advance_correction(uuid,boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;
