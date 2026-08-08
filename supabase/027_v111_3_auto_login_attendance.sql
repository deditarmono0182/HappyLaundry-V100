-- HappyLaundry Enterprise V111.3
-- Auto Attendance from Employee Login
-- Jalankan setelah SQL 024, 025, dan 026.

alter table public.v111_attendance
add column if not exists attendance_source text not null default 'manual';

alter table public.v111_attendance
add column if not exists check_in_at timestamptz null;

-- Keep source values predictable.
alter table public.v111_attendance
drop constraint if exists v111_attendance_source_check;

alter table public.v111_attendance
add constraint v111_attendance_source_check
check(attendance_source in('manual','login'));

create or replace function public.v111_auto_attendance_login()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_employee public.v109_users%rowtype;
  v_attendance_date date;
  v_existing public.v111_attendance%rowtype;
  v_row_count integer:=0;
  v_inserted boolean:=false;
begin
  -- Employee session must already be bound to auth.uid().
  select * into v_employee
  from public.v109_users
  where auth_uid=auth.uid()
    and is_active=true
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok',false,
      'reason','not_employee'
    );
  end if;

  -- HappyLaundry operates in WIB. Do not use UTC current_date around midnight.
  v_attendance_date := (now() at time zone 'Asia/Jakarta')::date;

  select * into v_existing
  from public.v111_attendance
  where employee_id=v_employee.id
    and attendance_date=v_attendance_date
  limit 1;

  -- Never overwrite an existing attendance row.
  -- This protects manual Izin/Sakit/Alpha set by Owner.
  if found then
    return jsonb_build_object(
      'ok',true,
      'created',false,
      'employee_id',v_employee.id,
      'attendance_date',v_attendance_date,
      'status',v_existing.status,
      'source',v_existing.attendance_source
    );
  end if;

  insert into public.v111_attendance(
    employee_id,
    attendance_date,
    status,
    note,
    attendance_source,
    check_in_at,
    created_at,
    updated_at
  ) values(
    v_employee.id,
    v_attendance_date,
    'present',
    'Otomatis dari login karyawan',
    'login',
    now(),
    now(),
    now()
  )
  on conflict(employee_id,attendance_date) do nothing;

  get diagnostics v_row_count = row_count;
  v_inserted := v_row_count > 0;

  if v_inserted then
    insert into public.v109_audit_log(
      employee_id,login_id,full_name,action,entity_type,entity_id,details
    ) values(
      v_employee.id,
      v_employee.login_id,
      v_employee.full_name,
      'AUTO_ATTENDANCE',
      'attendance',
      v_attendance_date::text,
      'Hadir otomatis dari login karyawan'
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'created',v_inserted,
    'employee_id',v_employee.id,
    'attendance_date',v_attendance_date,
    'status','present',
    'source','login',
    'check_in_at',now()
  );
end;
$$;

revoke all on function public.v111_auto_attendance_login() from public;
grant execute on function public.v111_auto_attendance_login() to authenticated;

notify pgrst,'reload schema';
