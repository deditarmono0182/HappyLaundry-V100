-- HappyLaundry Enterprise V112.0
-- Smart Attendance: Static Owner-Generated QR + GPS Radius
-- Jalankan setelah SQL 028_v111_4_owner_attendance_override.sql

create extension if not exists pgcrypto;

create table if not exists public.v112_attendance_settings(
  id integer primary key default 1 check(id=1),
  store_name text not null default 'HappyLaundry Babakan',
  latitude double precision null,
  longitude double precision null,
  radius_meters integer not null default 100 check(radius_meters between 20 and 1000),
  qr_token text not null default encode(gen_random_bytes(24),'hex'),
  qr_version integer not null default 1,
  qr_generated_at timestamptz not null default now(),
  attendance_start time not null default '06:00',
  attendance_end time not null default '11:00',
  enforce_time boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.v112_attendance_settings(id)
values(1)
on conflict(id) do nothing;

alter table public.v112_attendance_settings enable row level security;

drop policy if exists v112_attendance_settings_owner_all on public.v112_attendance_settings;
create policy v112_attendance_settings_owner_all
on public.v112_attendance_settings
for all to authenticated
using(exists(
  select 1 from public.profiles p
  where p.id=auth.uid() and p.role='owner'
))
with check(exists(
  select 1 from public.profiles p
  where p.id=auth.uid() and p.role='owner'
));

grant select,update on public.v112_attendance_settings to authenticated;

-- Extra verification data stored with attendance.
alter table public.v111_attendance
add column if not exists gps_latitude double precision null;

alter table public.v111_attendance
add column if not exists gps_longitude double precision null;

alter table public.v111_attendance
add column if not exists gps_accuracy_meters double precision null;

alter table public.v111_attendance
add column if not exists distance_meters double precision null;

alter table public.v111_attendance
add column if not exists attendance_device text null;

alter table public.v111_attendance
add column if not exists qr_version integer null;

-- Expand source constraint.
alter table public.v111_attendance
drop constraint if exists v111_attendance_source_check;

alter table public.v111_attendance
add constraint v111_attendance_source_check
check(attendance_source in('manual','login','owner_override','qr_gps'));

-- Disable old login-only attendance function behavior.
create or replace function public.v111_auto_attendance_login()
returns jsonb
language sql
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'ok',true,
    'created',false,
    'reason','disabled_v112_qr_gps_required'
  );
$$;

grant execute on function public.v111_auto_attendance_login() to authenticated;

-- Owner rotates the static QR whenever desired.
create or replace function public.v112_generate_attendance_qr()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_token text;
  v_version integer;
begin
  if auth.uid() is null or not exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  ) then
    raise exception 'Hanya Owner yang dapat Generate QR Absen.';
  end if;

  v_token:=encode(gen_random_bytes(24),'hex');

  update public.v112_attendance_settings
  set
    qr_token=v_token,
    qr_version=qr_version+1,
    qr_generated_at=now(),
    updated_at=now()
  where id=1
  returning qr_version into v_version;

  insert into public.v109_audit_log(
    action,entity_type,entity_id,details
  ) values(
    'GENERATE_ATTENDANCE_QR','attendance_qr',v_version::text,
    'Owner membuat QR Absen baru. QR lama tidak berlaku.'
  );

  return jsonb_build_object(
    'ok',true,
    'qr_token',v_token,
    'qr_version',v_version
  );
end;
$$;

revoke all on function public.v112_generate_attendance_qr() from public;
grant execute on function public.v112_generate_attendance_qr() to authenticated;

-- Owner can see QR usage today without exposing attendance details elsewhere.
create or replace function public.v112_attendance_qr_usage_today()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count bigint:=0;
begin
  if auth.uid() is null or not exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='owner'
  ) then
    raise exception 'Hanya Owner.';
  end if;

  select count(*) into v_count
  from public.v111_attendance
  where attendance_date=(now() at time zone 'Asia/Jakarta')::date
    and attendance_source='qr_gps';

  return jsonb_build_object('usage_count',v_count);
end;
$$;

revoke all on function public.v112_attendance_qr_usage_today() from public;
grant execute on function public.v112_attendance_qr_usage_today() to authenticated;

-- QR + GPS attendance.
create or replace function public.v112_record_qr_gps_attendance(
  p_qr_token text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision default null,
  p_device text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_employee public.v109_users%rowtype;
  v_settings public.v112_attendance_settings%rowtype;
  v_existing public.v111_attendance%rowtype;
  v_date date;
  v_local_time time;
  v_lat1 double precision;
  v_lat2 double precision;
  v_dlat double precision;
  v_dlon double precision;
  v_a double precision;
  v_c double precision;
  v_distance double precision;
begin
  select * into v_employee
  from public.v109_users
  where auth_uid=auth.uid()
    and is_active=true
  limit 1;

  if not found then
    raise exception 'Sesi karyawan tidak valid. Silakan login ulang.';
  end if;

  select * into v_settings
  from public.v112_attendance_settings
  where id=1;

  if v_settings.latitude is null or v_settings.longitude is null then
    raise exception 'Lokasi toko belum diatur oleh Owner.';
  end if;

  if coalesce(btrim(p_qr_token),'')='' or p_qr_token<>v_settings.qr_token then
    raise exception 'QR Absen tidak valid atau sudah diganti Owner.';
  end if;

  if p_latitude is null or p_longitude is null then
    raise exception 'GPS wajib aktif untuk absensi.';
  end if;

  -- Haversine distance in meters.
  v_lat1:=radians(v_settings.latitude);
  v_lat2:=radians(p_latitude);
  v_dlat:=radians(p_latitude-v_settings.latitude);
  v_dlon:=radians(p_longitude-v_settings.longitude);
  v_a:=sin(v_dlat/2)^2 + cos(v_lat1)*cos(v_lat2)*sin(v_dlon/2)^2;
  v_c:=2*atan2(sqrt(v_a),sqrt(1-v_a));
  v_distance:=6371000*v_c;

  if v_distance>v_settings.radius_meters then
    raise exception 'Anda berada di luar area HappyLaundry. Jarak sekitar % meter, batas % meter.',
      round(v_distance)::integer,v_settings.radius_meters;
  end if;

  -- Reject extremely inaccurate GPS that could make radius checks meaningless.
  if p_accuracy_meters is not null and p_accuracy_meters>300 then
    raise exception 'Akurasi GPS terlalu rendah (% meter). Coba pindah ke area terbuka dan ulangi.',
      round(p_accuracy_meters)::integer;
  end if;

  v_date:=(now() at time zone 'Asia/Jakarta')::date;
  v_local_time:=(now() at time zone 'Asia/Jakarta')::time;

  if v_settings.enforce_time then
    if v_local_time<v_settings.attendance_start or v_local_time>v_settings.attendance_end then
      raise exception 'Di luar jam absen masuk (% - %).',
        to_char(v_settings.attendance_start,'HH24:MI'),
        to_char(v_settings.attendance_end,'HH24:MI');
    end if;
  end if;

  select * into v_existing
  from public.v111_attendance
  where employee_id=v_employee.id
    and attendance_date=v_date
  limit 1;

  if found then
    return jsonb_build_object(
      'ok',true,
      'created',false,
      'status',v_existing.status,
      'attendance_date',v_date,
      'check_in_at',v_existing.check_in_at,
      'distance_meters',coalesce(v_existing.distance_meters,v_distance),
      'message','Absensi hari ini sudah tercatat.'
    );
  end if;

  insert into public.v111_attendance(
    employee_id,attendance_date,status,note,attendance_source,check_in_at,
    gps_latitude,gps_longitude,gps_accuracy_meters,distance_meters,
    attendance_device,qr_version,created_at,updated_at
  ) values(
    v_employee.id,v_date,'present','Valid QR + GPS','qr_gps',now(),
    p_latitude,p_longitude,p_accuracy_meters,v_distance,
    nullif(btrim(coalesce(p_device,'')),''),v_settings.qr_version,now(),now()
  );

  insert into public.v109_audit_log(
    employee_id,login_id,full_name,action,entity_type,entity_id,details
  ) values(
    v_employee.id,v_employee.login_id,v_employee.full_name,
    'QR_GPS_ATTENDANCE','attendance',v_date::text,
    'Hadir via QR + GPS. Jarak '||round(v_distance)::text||' meter. QR v'||v_settings.qr_version::text
  );

  return jsonb_build_object(
    'ok',true,
    'created',true,
    'status','present',
    'attendance_date',v_date,
    'check_in_at',now(),
    'distance_meters',v_distance,
    'qr_version',v_settings.qr_version,
    'message','Absensi berhasil.'
  );
end;
$$;

revoke all on function public.v112_record_qr_gps_attendance(text,double precision,double precision,double precision,text) from public;
grant execute on function public.v112_record_qr_gps_attendance(text,double precision,double precision,double precision,text) to authenticated;

notify pgrst,'reload schema';
