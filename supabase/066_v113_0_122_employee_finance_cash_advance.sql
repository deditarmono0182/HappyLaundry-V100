-- HappyLaundry V113.0.122
-- SQL 066 — Employee Finance Cash Advance Access
-- Jalankan setelah SQL 065.

create or replace function public.v113122_can_manage_cash_advance()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    public.v109_is_owner()
    or exists(
      select 1
      from public.v109_users u
      where u.auth_uid=auth.uid()
        and u.is_active=true
        and coalesce(u.finance,false)=true
    );
$$;

revoke all on function public.v113122_can_manage_cash_advance() from public;
grant execute on function public.v113122_can_manage_cash_advance() to authenticated;

create or replace function public.v113122_finance_list_employees()
returns table(
  id uuid,
  full_name text,
  login_id text
)
language sql
stable
security definer
set search_path=public
as $$
  select u.id,u.full_name,u.login_id
  from public.v109_users u
  where public.v113122_can_manage_cash_advance()
    and u.is_active=true
  order by u.full_name,u.login_id;
$$;

revoke all on function public.v113122_finance_list_employees() from public;
grant execute on function public.v113122_finance_list_employees() to authenticated;

create or replace function public.v113122_finance_list_cash_advances()
returns table(
  id uuid,
  employee_id uuid,
  employee_name text,
  amount numeric,
  remaining_amount numeric,
  note text,
  issued_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
  select
    a.id,
    a.employee_id,
    u.full_name as employee_name,
    a.amount,
    a.remaining_amount,
    a.note,
    a.issued_at
  from public.v113072_employee_cash_advances a
  join public.v109_users u on u.id=a.employee_id
  where public.v113122_can_manage_cash_advance()
    and coalesce(a.cancelled_at,null) is null
  order by a.issued_at desc
  limit 250;
$$;

revoke all on function public.v113122_finance_list_cash_advances() from public;
grant execute on function public.v113122_finance_list_cash_advances() to authenticated;

create or replace function public.v113122_add_cash_advance(
  p_employee_id uuid,
  p_amount numeric,
  p_note text default null,
  p_payment_method text default 'cash'
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_advance_id uuid;
  v_employee_name text;
  v_note text:=nullif(btrim(coalesce(p_note,'')),'');
  v_method text:=lower(btrim(coalesce(p_payment_method,'cash')));
begin
  if not public.v113122_can_manage_cash_advance() then
    raise exception 'Akses ditolak. Hanya Owner atau karyawan dengan akses Keuangan yang dapat input kas bon.';
  end if;

  if coalesce(p_amount,0)<=0 then
    raise exception 'Nominal kas bon harus lebih dari 0.';
  end if;

  if v_method not in('cash','qris','transfer','other') then
    raise exception 'Metode pemberian kas bon tidak valid.';
  end if;

  select u.full_name
  into v_employee_name
  from public.v109_users u
  where u.id=p_employee_id
    and u.is_active=true;

  if v_employee_name is null then
    raise exception 'Karyawan tidak ditemukan atau sudah nonaktif.';
  end if;

  insert into public.v113072_employee_cash_advances(
    employee_id,amount,remaining_amount,note,created_by
  )
  values(
    p_employee_id,p_amount,p_amount,v_note,auth.uid()
  )
  returning id into v_advance_id;

  -- Kas bon adalah KAS KELUAR, tetapi BUKAN biaya operasional.
  -- Karena itu dicatat di Kas Harian, bukan v106_expenses.
  insert into public.v100_cash_transactions(
    kind,category,description,amount,method,created_by
  )
  values(
    'expense',
    'Kas Bon Karyawan',
    'Kas bon - '||v_employee_name||
      case when v_note is not null then ' • '||v_note else '' end,
    p_amount,
    v_method,
    auth.uid()
  );

  return v_advance_id;
end;
$$;

revoke all on function public.v113122_add_cash_advance(uuid,numeric,text,text) from public;
grant execute on function public.v113122_add_cash_advance(uuid,numeric,text,text) to authenticated;

notify pgrst,'reload schema';
