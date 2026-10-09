-- HappyLaundry V113.0.123
-- SQL 067 — Owner Cash Advance Correction
-- Jalankan setelah SQL kas bon yang sudah ada.
-- Fungsi ini khusus Owner.

create table if not exists public.v113123_cash_advance_corrections(
  id uuid primary key default gen_random_uuid(),
  cash_advance_id uuid not null references public.v113072_employee_cash_advances(id) on delete cascade,
  employee_id uuid not null references public.v109_users(id) on delete cascade,
  old_amount numeric(14,2) not null,
  new_amount numeric(14,2) not null,
  old_remaining numeric(14,2) not null,
  new_remaining numeric(14,2) not null,
  old_note text,
  new_note text,
  reason text not null,
  cash_adjustment numeric(14,2) not null default 0,
  corrected_by uuid default auth.uid(),
  corrected_at timestamptz not null default now()
);

create index if not exists v113123_cash_advance_corrections_idx
  on public.v113123_cash_advance_corrections(cash_advance_id,corrected_at desc);

alter table public.v113123_cash_advance_corrections enable row level security;

drop policy if exists v113123_cash_advance_corrections_owner on public.v113123_cash_advance_corrections;
create policy v113123_cash_advance_corrections_owner
on public.v113123_cash_advance_corrections
for all to authenticated
using(public.v109_is_owner())
with check(public.v109_is_owner());

grant select,insert on public.v113123_cash_advance_corrections to authenticated;


create or replace function public.v113123_owner_correct_cash_advance(
  p_cash_advance_id uuid,
  p_new_amount numeric,
  p_new_note text,
  p_reason text
)
returns table(
  cash_advance_id uuid,
  old_amount numeric,
  new_amount numeric,
  new_remaining numeric,
  cash_adjustment numeric
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_old public.v113072_employee_cash_advances%rowtype;
  v_employee_name text;
  v_deducted numeric;
  v_new_remaining numeric;
  v_delta numeric;
  v_reason text:=btrim(coalesce(p_reason,''));
  v_note text:=nullif(btrim(coalesce(p_new_note,'')),'');
begin
  if not public.v109_is_owner() then
    raise exception 'Hanya Owner yang dapat mengoreksi kas bon.';
  end if;

  if length(v_reason)<5 then
    raise exception 'Alasan koreksi minimal 5 karakter.';
  end if;

  if coalesce(p_new_amount,0)<=0 then
    raise exception 'Nominal kas bon harus lebih dari 0.';
  end if;

  select *
  into v_old
  from public.v113072_employee_cash_advances
  where id=p_cash_advance_id
  for update;

  if not found then
    raise exception 'Kas bon tidak ditemukan.';
  end if;

  -- Jika instalasi punya kolom cancelled_at dan record sudah dibatalkan,
  -- UI tidak akan menawarkan koreksi. Fungsi tetap fokus pada nominal aktif.
  v_deducted:=greatest(0,coalesce(v_old.amount,0)-coalesce(v_old.remaining_amount,0));

  if p_new_amount<v_deducted then
    raise exception 'Nominal baru tidak boleh lebih kecil dari total yang sudah dipotong dari gaji (%).',v_deducted;
  end if;

  v_new_remaining:=greatest(0,p_new_amount-v_deducted);
  v_delta:=p_new_amount-v_old.amount;

  select full_name into v_employee_name
  from public.v109_users
  where id=v_old.employee_id;

  update public.v113072_employee_cash_advances
  set
    amount=p_new_amount,
    remaining_amount=v_new_remaining,
    note=v_note
  where id=p_cash_advance_id;

  insert into public.v113123_cash_advance_corrections(
    cash_advance_id,employee_id,
    old_amount,new_amount,
    old_remaining,new_remaining,
    old_note,new_note,
    reason,cash_adjustment
  )
  values(
    v_old.id,v_old.employee_id,
    v_old.amount,p_new_amount,
    v_old.remaining_amount,v_new_remaining,
    v_old.note,v_note,
    v_reason,v_delta
  );

  -- Koreksi nominal juga harus menyesuaikan Kas Harian.
  -- Naik = tambahan kas keluar. Turun = pengembalian/koreksi kas masuk.
  if v_delta>0 then
    insert into public.v100_cash_transactions(
      kind,category,description,amount,method,created_by
    )
    values(
      'expense',
      'Koreksi Kas Bon Karyawan',
      'Tambah koreksi kas bon - '||coalesce(v_employee_name,'Karyawan')||' • '||v_reason,
      v_delta,
      'cash',
      auth.uid()
    );
  elsif v_delta<0 then
    insert into public.v100_cash_transactions(
      kind,category,description,amount,method,created_by
    )
    values(
      'income',
      'Koreksi Kas Bon Karyawan',
      'Pengembalian koreksi kas bon - '||coalesce(v_employee_name,'Karyawan')||' • '||v_reason,
      abs(v_delta),
      'cash',
      auth.uid()
    );
  end if;

  return query
  select v_old.id,v_old.amount,p_new_amount,v_new_remaining,v_delta;
end;
$$;

revoke all on function public.v113123_owner_correct_cash_advance(uuid,numeric,text,text) from public;
grant execute on function public.v113123_owner_correct_cash_advance(uuid,numeric,text,text) to authenticated;

notify pgrst,'reload schema';
