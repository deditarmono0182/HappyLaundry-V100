-- HappyLaundry V113.0.72 - Kas Bon Karyawan + Gaji Saya (Bagian B)

create or replace function public.v113072_add_cash_advance(
  p_employee_id uuid,
  p_amount numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid;
begin
  if not public.v109_is_owner() then raise exception 'Hanya Owner.'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'Nominal kas bon harus lebih dari 0.'; end if;

  insert into public.v113072_employee_cash_advances(employee_id,amount,remaining_amount,note)
  values(p_employee_id,p_amount,p_amount,nullif(btrim(coalesce(p_note,'')),''))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.v113072_add_cash_advance(uuid,numeric,text) to authenticated;

create or replace function public.v113072_apply_cash_advance_deduction(
  p_employee_id uuid,
  p_payroll_month date,
  p_amount numeric
)
returns numeric
language plpgsql
security definer
set search_path=public
as $$
declare
  v_left numeric := greatest(0,coalesce(p_amount,0));
  v_take numeric;
  v_applied numeric := 0;
  r record;
begin
  if not public.v109_is_owner() then raise exception 'Hanya Owner.'; end if;
  if extract(day from p_payroll_month)<>1 then raise exception 'Periode gaji harus tanggal 1.'; end if;

  for r in
    select id,remaining_amount
    from public.v113072_employee_cash_advances
    where employee_id=p_employee_id and remaining_amount>0
    order by issued_at,id
    for update
  loop
    exit when v_left<=0;
    v_take:=least(v_left,r.remaining_amount);
    update public.v113072_employee_cash_advances
      set remaining_amount=remaining_amount-v_take
      where id=r.id;
    insert into public.v113072_cash_advance_deductions(cash_advance_id,employee_id,payroll_month,amount)
      values(r.id,p_employee_id,p_payroll_month,v_take);
    v_applied:=v_applied+v_take;
    v_left:=v_left-v_take;
  end loop;

  return v_applied;
end;
$$;

grant execute on function public.v113072_apply_cash_advance_deduction(uuid,date,numeric) to authenticated;

notify pgrst,'reload schema';
