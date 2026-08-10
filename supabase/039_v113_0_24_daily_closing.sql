-- HappyLaundry Enterprise V113.0.24 — Closing Harian
-- Jalankan setelah SQL 038.

create table if not exists public.v11324_daily_closings(id uuid primary key default gen_random_uuid(),closing_date date not null unique,payment_cash numeric(14,2) not null default 0,payment_qris numeric(14,2) not null default 0,payment_transfer numeric(14,2) not null default 0,payment_other numeric(14,2) not null default 0,total_income numeric(14,2) not null default 0,cash_expense numeric(14,2) not null default 0,total_expense numeric(14,2) not null default 0,receivable numeric(14,2) not null default 0,receivable_count integer not null default 0,expected_cash numeric(14,2) not null default 0,actual_cash numeric(14,2) not null default 0,cash_difference numeric(14,2) not null default 0,note text null,closed_by uuid null references auth.users(id) on delete set null,closed_by_name text not null,closed_at timestamptz not null default now());
alter table public.v11324_daily_closings enable row level security;
drop policy if exists v11324_closing_select on public.v11324_daily_closings;
create policy v11324_closing_select on public.v11324_daily_closings for select to authenticated using(public.v109_is_owner() or exists(select 1 from public.v109_users u where u.auth_uid=auth.uid() and u.is_active=true and u.cash=true));
grant select on public.v11324_daily_closings to authenticated;
create or replace function public.v11324_can_close() returns boolean language sql security definer stable set search_path=public as $$select public.v109_is_owner() or exists(select 1 from public.v109_users u where u.auth_uid=auth.uid() and u.is_active=true and u.cash=true)$$;
grant execute on function public.v11324_can_close() to authenticated;
create or replace function public.v11324_actor_name() returns text language sql security definer stable set search_path=public as $$select coalesce((select p.full_name from public.profiles p where p.id=auth.uid() limit 1),(select u.full_name from public.v109_users u where u.auth_uid=auth.uid() and u.is_active=true limit 1),'Pengguna')$$;
grant execute on function public.v11324_actor_name() to authenticated;
create or replace function public.v11324_daily_closing_summary(p_date date default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare d date:=coalesce(p_date,(now() at time zone 'Asia/Jakarta')::date);v_cash numeric:=0;v_qris numeric:=0;v_transfer numeric:=0;v_other numeric:=0;v_expense numeric:=0;v_cash_expense numeric:=0;v_receivable numeric:=0;v_receivable_count integer:=0;
begin
 if not public.v11324_can_close() then raise exception 'Anda tidak memiliki hak akses Kas/Closing.';end if;
 select coalesce(sum(amount) filter(where method='cash'),0),coalesce(sum(amount) filter(where method='qris'),0),coalesce(sum(amount) filter(where method='transfer'),0),coalesce(sum(amount) filter(where method not in('cash','qris','transfer')),0) into v_cash,v_qris,v_transfer,v_other from public.v100_payments where (created_at at time zone 'Asia/Jakarta')::date=d;
 select coalesce(sum(amount),0),coalesce(sum(amount) filter(where lower(coalesce(payment_method,''))='cash'),0) into v_expense,v_cash_expense from public.v106_expenses where expense_date=d;
 select coalesce(sum(greatest(0,total-paid_amount)),0),count(*) filter(where greatest(0,total-paid_amount)>0) into v_receivable,v_receivable_count from public.v100_orders where status<>'cancelled';
 return jsonb_build_object('closing_date',d,'payment_cash',v_cash,'payment_qris',v_qris,'payment_transfer',v_transfer,'payment_other',v_other,'total_income',v_cash+v_qris+v_transfer+v_other,'cash_expense',v_cash_expense,'total_expense',v_expense,'receivable',v_receivable,'receivable_count',v_receivable_count,'expected_cash',v_cash-v_cash_expense);
end;$$;
grant execute on function public.v11324_daily_closing_summary(date) to authenticated;
create or replace function public.v11324_close_day(p_date date,p_actual_cash numeric,p_note text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb;r public.v11324_daily_closings%rowtype;actor text;
begin
 if not public.v11324_can_close() then raise exception 'Anda tidak memiliki hak akses Kas/Closing.';end if;
 if p_date is null then raise exception 'Tanggal closing wajib diisi.';end if;
 if p_date>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal closing tidak boleh di masa depan.';end if;
 if coalesce(p_actual_cash,-1)<0 then raise exception 'Kas aktual tidak valid.';end if;
 if exists(select 1 from public.v11324_daily_closings where closing_date=p_date) then raise exception 'Tanggal % sudah pernah di-closing dan snapshot terkunci.',p_date;end if;
 s:=public.v11324_daily_closing_summary(p_date);actor:=public.v11324_actor_name();
 insert into public.v11324_daily_closings(closing_date,payment_cash,payment_qris,payment_transfer,payment_other,total_income,cash_expense,total_expense,receivable,receivable_count,expected_cash,actual_cash,cash_difference,note,closed_by,closed_by_name)
 values(p_date,(s->>'payment_cash')::numeric,(s->>'payment_qris')::numeric,(s->>'payment_transfer')::numeric,(s->>'payment_other')::numeric,(s->>'total_income')::numeric,(s->>'cash_expense')::numeric,(s->>'total_expense')::numeric,(s->>'receivable')::numeric,(s->>'receivable_count')::integer,(s->>'expected_cash')::numeric,p_actual_cash,p_actual_cash-(s->>'expected_cash')::numeric,nullif(trim(coalesce(p_note,'')),''),auth.uid(),actor) returning * into r;
 insert into public.v109_audit_log(action,entity_type,entity_id,details) values('DAILY_CLOSING','daily_closing',r.id::text,'Closing '||p_date::text||' oleh '||actor||'. Kas seharusnya Rp '||trim(to_char(r.expected_cash,'FM999G999G999G990'))||', kas aktual Rp '||trim(to_char(r.actual_cash,'FM999G999G999G990'))||', selisih Rp '||trim(to_char(r.cash_difference,'FM999G999G999G990'))||'.');
 return to_jsonb(r);
end;$$;
grant execute on function public.v11324_close_day(date,numeric,text) to authenticated;
notify pgrst,'reload schema';
