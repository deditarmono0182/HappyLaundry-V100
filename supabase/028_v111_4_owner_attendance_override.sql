-- HappyLaundry Enterprise V111.4
-- Owner Attendance Override
-- Jalankan setelah SQL 027_v111_3_auto_login_attendance.sql

alter table public.v111_attendance
add column if not exists override_reason text null;

alter table public.v111_attendance
add column if not exists overridden_at timestamptz null;

alter table public.v111_attendance
add column if not exists overridden_by uuid null references auth.users(id) on delete set null;

-- Expand source values from V111.3.
alter table public.v111_attendance
drop constraint if exists v111_attendance_source_check;

alter table public.v111_attendance
add constraint v111_attendance_source_check
check(attendance_source in('manual','login','owner_override'));

create or replace function public.v111_owner_override_attendance(
  p_employee_id uuid,
  p_attendance_date date,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_employee public.v109_users%rowtype;
  v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not exists(
    select 1
    from public.profiles p
    where p.id=auth.uid()
      and p.role='owner'
  ) then
    raise exception 'Hanya Owner yang dapat mengubah absensi manual.';
  end if;

  if p_status not in('present','permission','sick','absent') then
    raise exception 'Status absensi tidak valid.';
  end if;

  if v_reason='' then
    raise exception 'Alasan perubahan absensi wajib diisi.';
  end if;

  select * into v_employee
  from public.v109_users
  where id=p_employee_id
  limit 1;

  if not found then
    raise exception 'Karyawan tidak ditemukan.';
  end if;

  insert into public.v111_attendance(
    employee_id,
    attendance_date,
    status,
    note,
    attendance_source,
    check_in_at,
    override_reason,
    overridden_at,
    overridden_by,
    created_at,
    updated_at
  ) values(
    v_employee.id,
    p_attendance_date,
    p_status,
    v_reason,
    'owner_override',
    case when p_status='present' then now() else null end,
    v_reason,
    now(),
    auth.uid(),
    now(),
    now()
  )
  on conflict(employee_id,attendance_date)
  do update set
    status=excluded.status,
    note=excluded.note,
    attendance_source='owner_override',
    check_in_at=case
      when excluded.status='present'
        then coalesce(public.v111_attendance.check_in_at,now())
      else public.v111_attendance.check_in_at
    end,
    override_reason=excluded.override_reason,
    overridden_at=now(),
    overridden_by=auth.uid(),
    updated_at=now();

  insert into public.v109_audit_log(
    employee_id,
    login_id,
    full_name,
    action,
    entity_type,
    entity_id,
    details
  ) values(
    v_employee.id,
    v_employee.login_id,
    v_employee.full_name,
    'OWNER_ATTENDANCE_OVERRIDE',
    'attendance',
    p_attendance_date::text,
    'Owner mengubah absensi menjadi '||p_status||'. Alasan: '||v_reason
  );

  return jsonb_build_object(
    'ok',true,
    'message',
      v_employee.full_name||' berhasil diubah menjadi '||
      case p_status
        when 'present' then 'Hadir Manual'
        when 'permission' then 'Izin'
        when 'sick' then 'Sakit'
        when 'absent' then 'Alpha'
      end||'.',
    'employee_id',v_employee.id,
    'attendance_date',p_attendance_date,
    'status',p_status,
    'source','owner_override',
    'reason',v_reason
  );
end;
$$;

revoke all on function public.v111_owner_override_attendance(uuid,date,text,text) from public;
grant execute on function public.v111_owner_override_attendance(uuid,date,text,text) to authenticated;

notify pgrst,'reload schema';
