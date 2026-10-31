-- HappyLaundry V113.0.153. Jalankan setelah SQL 081.
-- Pembayaran kasbon tunai/transfer bukan omzet dan bukan potongan gaji.
begin;
create table if not exists public.v113153_cash_advance_repayments(
 id uuid primary key,employee_id uuid not null references public.v109_users(id),
 amount numeric(14,2) not null check(amount>0),method text not null check(method in ('cash','transfer')),
 reference text,note text,created_by uuid not null,created_at timestamptz not null default now(),
 cash_transaction_id uuid not null references public.v100_cash_transactions(id),
 cancelled_at timestamptz,cancelled_by uuid,cancel_reason text,
 refund_cash_transaction_id uuid references public.v100_cash_transactions(id)
);
create table if not exists public.v113153_cash_advance_repayment_allocations(
 repayment_id uuid not null references public.v113153_cash_advance_repayments(id),
 cash_advance_id uuid not null references public.v113072_employee_cash_advances(id),
 amount numeric(14,2) not null check(amount>0),primary key(repayment_id,cash_advance_id)
);
alter table public.v113153_cash_advance_repayments enable row level security;
alter table public.v113153_cash_advance_repayment_allocations enable row level security;
drop policy if exists authorized_read on public.v113153_cash_advance_repayments;
create policy authorized_read on public.v113153_cash_advance_repayments for select to authenticated using(
 public.v113122_can_manage_cash_advance() or employee_id=(select e.id from public.v109_current_employee() e limit 1));
drop policy if exists authorized_read on public.v113153_cash_advance_repayment_allocations;
create policy authorized_read on public.v113153_cash_advance_repayment_allocations for select to authenticated using(
 exists(select 1 from public.v113153_cash_advance_repayments p where p.id=repayment_id));
grant select on public.v113153_cash_advance_repayments,public.v113153_cash_advance_repayment_allocations to authenticated;
revoke insert,update,delete on public.v113153_cash_advance_repayments,public.v113153_cash_advance_repayment_allocations from authenticated,anon;

create or replace function public.v113153_receive_cash_advance_repayment(
 p_request_id uuid,p_employee_id uuid,p_amount numeric,p_method text,p_reference text default null,p_note text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_existing public.v113153_cash_advance_repayments%rowtype;v_debt numeric;v_left numeric;v_take numeric;v_cash uuid;v_name text;r record;
begin
 if auth.uid() is null or not public.v109_is_owner() then raise exception 'Hanya Owner dapat mencatat pembayaran kasbon.';end if;
 if p_request_id is null or p_employee_id is null or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Nominal pembayaran tidak valid.';end if;
 if p_method is null or p_method not in ('cash','transfer') then raise exception 'Pilih Tunai atau Transfer.';end if;
 if p_method='transfer' and length(btrim(coalesce(p_reference,'')))<3 then raise exception 'Isi referensi transfer minimal 3 karakter.';end if;
 lock table public.v113072_employee_cash_advances,public.v113153_cash_advance_repayments,public.v113153_cash_advance_repayment_allocations in exclusive mode;
 select * into v_existing from public.v113153_cash_advance_repayments where id=p_request_id;
 if found then
  if v_existing.employee_id<>p_employee_id or v_existing.amount<>p_amount or v_existing.method<>p_method or v_existing.created_by<>auth.uid()
   or coalesce(v_existing.reference,'')<>btrim(coalesce(p_reference,'')) or coalesce(v_existing.note,'')<>btrim(coalesce(p_note,'')) then raise exception 'ID pembayaran sudah dipakai untuk data lain.';end if;
  return jsonb_build_object('id',v_existing.id,'already_recorded',true,'cancelled',v_existing.cancelled_at is not null);
 end if;
 select full_name into v_name from public.v109_users where id=p_employee_id;
 if v_name is null then raise exception 'Karyawan tidak ditemukan.';end if;
 select coalesce(sum(remaining_amount),0) into v_debt from public.v113072_employee_cash_advances where employee_id=p_employee_id and cancelled_at is null;
 if p_amount>v_debt then raise exception 'Pembayaran melebihi sisa utang kasbon Rp %.',v_debt;end if;
 insert into public.v100_cash_transactions(kind,category,description,amount,method,created_by)
 values('income','Pelunasan Kasbon Karyawan',format('Pembayaran kasbon %s. Referensi: %s. %s',v_name,coalesce(p_reference,'-'),coalesce(p_note,'')),p_amount,p_method,auth.uid()) returning id into v_cash;
 insert into public.v113153_cash_advance_repayments(id,employee_id,amount,method,reference,note,created_by,cash_transaction_id)
 values(p_request_id,p_employee_id,p_amount,p_method,nullif(btrim(p_reference),''),nullif(btrim(p_note),''),auth.uid(),v_cash);
 v_left:=p_amount;
 for r in select * from public.v113072_employee_cash_advances where employee_id=p_employee_id and cancelled_at is null and remaining_amount>0 order by issued_at,id loop
  exit when v_left<=0;v_take:=least(v_left,r.remaining_amount);
  update public.v113072_employee_cash_advances set remaining_amount=remaining_amount-v_take where id=r.id;
  insert into public.v113153_cash_advance_repayment_allocations values(p_request_id,r.id,v_take);
  v_left:=v_left-v_take;
 end loop;
 if v_left<>0 or (select coalesce(sum(remaining_amount),0) from public.v113072_employee_cash_advances where employee_id=p_employee_id and cancelled_at is null)<>v_debt-p_amount then raise exception 'Validasi saldo gagal. Semua perubahan dibatalkan.';end if;
 insert into public.v109_audit_log(employee_id,full_name,action,entity_type,entity_id,details)
 values(p_employee_id,v_name,'OWNER_CASH_ADVANCE_REPAYMENT','cash_advance_repayment',p_request_id::text,format('Pembayaran kasbon Rp%s via %s. Referensi: %s. Saldo Rp%s menjadi Rp%s.',p_amount,p_method,coalesce(p_reference,'-'),v_debt,v_debt-p_amount));
 return jsonb_build_object('id',p_request_id,'amount',p_amount,'new_remaining',v_debt-p_amount,'cash_transaction_id',v_cash);
end;$$;
revoke all on function public.v113153_receive_cash_advance_repayment(uuid,uuid,numeric,text,text,text) from public,anon;
grant execute on function public.v113153_receive_cash_advance_repayment(uuid,uuid,numeric,text,text,text) to authenticated;

create or replace function public.v113153_cancel_cash_advance_repayment(p_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.v113153_cash_advance_repayments%rowtype;r record;v_refund uuid;v_name text;
begin
 if auth.uid() is null or not public.v109_is_owner() then raise exception 'Hanya Owner.';end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Alasan pembatalan minimal 5 karakter.';end if;
 lock table public.v113072_employee_cash_advances,public.v113153_cash_advance_repayments,public.v113153_cash_advance_repayment_allocations in exclusive mode;
 select * into p from public.v113153_cash_advance_repayments where id=p_id;
 if not found then raise exception 'Pembayaran tidak ditemukan.';end if;
 if p.cancelled_at is not null then return jsonb_build_object('id',p_id,'already_cancelled',true);end if;
 for r in select a.id,a.amount,a.remaining_amount,x.amount paid from public.v113153_cash_advance_repayment_allocations x join public.v113072_employee_cash_advances a on a.id=x.cash_advance_id where x.repayment_id=p_id loop
  if r.remaining_amount+r.paid>r.amount then raise exception 'Saldo hasil pembatalan melebihi nilai pinjaman. Periksa koreksi pinjaman terlebih dahulu.';end if;
  update public.v113072_employee_cash_advances set remaining_amount=remaining_amount+r.paid where id=r.id;
 end loop;
 select full_name into v_name from public.v109_users where id=p.employee_id;
 insert into public.v100_cash_transactions(kind,category,description,amount,method,created_by)
 values('expense','Pembatalan Pelunasan Kasbon',format('Pembatalan pembayaran kasbon %s, ID %s. %s',v_name,p_id,p_reason),p.amount,p.method,auth.uid()) returning id into v_refund;
 update public.v113153_cash_advance_repayments set cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=btrim(p_reason),refund_cash_transaction_id=v_refund where id=p_id;
 insert into public.v109_audit_log(employee_id,full_name,action,entity_type,entity_id,details)
 values(p.employee_id,v_name,'OWNER_CANCEL_CASH_ADVANCE_REPAYMENT','cash_advance_repayment',p_id::text,p_reason);
 return jsonb_build_object('id',p_id,'cancelled',true);
end;$$;
revoke all on function public.v113153_cancel_cash_advance_repayment(uuid,text) from public,anon;
grant execute on function public.v113153_cancel_cash_advance_repayment(uuid,text) to authenticated;

create or replace function public.v113153_guard_repayment_loan() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='DELETE' then
  if exists(select 1 from public.v113153_cash_advance_repayment_allocations where cash_advance_id=old.id) then raise exception 'Pinjaman memiliki riwayat pembayaran dan tidak dapat dihapus.';end if;return old;
 end if;
 if old.cancelled_at is null and new.cancelled_at is not null and exists(select 1 from public.v113153_cash_advance_repayment_allocations a join public.v113153_cash_advance_repayments p on p.id=a.repayment_id where a.cash_advance_id=old.id and p.cancelled_at is null) then
 raise exception 'Batalkan pembayaran tunai/transfer yang terkait terlebih dahulu sebelum membatalkan pinjaman.';end if;return new;
end;$$;
revoke all on function public.v113153_guard_repayment_loan() from public,anon,authenticated;
drop trigger if exists v113153_repayment_loan_guard on public.v113072_employee_cash_advances;
create trigger v113153_repayment_loan_guard before update of cancelled_at or delete on public.v113072_employee_cash_advances for each row execute function public.v113153_guard_repayment_loan();
create or replace function public.v113153_guard_repayment_cash() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.v113153_cash_advance_repayments where cash_transaction_id=old.id or refund_cash_transaction_id=old.id) then raise exception 'Transaksi terkait pembayaran kasbon. Gunakan pembatalan di menu Potongan Kasbon.';end if;
 if TG_OP='DELETE' then return old;end if;return new;
end;$$;
revoke all on function public.v113153_guard_repayment_cash() from public,anon,authenticated;
drop trigger if exists v113153_repayment_cash_guard on public.v100_cash_transactions;
create trigger v113153_repayment_cash_guard before update or delete on public.v100_cash_transactions for each row execute function public.v113153_guard_repayment_cash();
notify pgrst,'reload schema';
commit;
