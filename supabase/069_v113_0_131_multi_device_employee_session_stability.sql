-- HappyLaundry V113.0.131
-- SQL 069 - Multi-Device Employee Session Stability
-- Akar masalah yang diperbaiki:
-- v109_users.auth_uid hanya mampu menyimpan SATU session/device per karyawan.
-- Login dari device lain dapat menimpa binding sebelumnya sehingga profile/menu/absensi
-- pada device lama menjadi tidak dikenali.
--
-- Migrasi ini membuat tabel session terpisah sehingga satu karyawan dapat memiliki
-- beberapa session aktif pada HP/laptop yang berbeda tanpa saling menendang.
-- Tidak mengubah order, pelanggan, layanan, payroll, komisi, atau histori absensi.

begin;

-- =========================================================
-- 1. SESSION TABLE
-- =========================================================
create table if not exists public.v109_employee_sessions(
  auth_uid uuid primary key,
  employee_id uuid not null references public.v109_users(id) on delete cascade,
  device text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz null
);

create index if not exists v109_employee_sessions_employee_idx
  on public.v109_employee_sessions(employee_id);

create index if not exists v109_employee_sessions_active_employee_idx
  on public.v109_employee_sessions(employee_id,is_active);

alter table public.v109_employee_sessions enable row level security;

-- Tidak ada direct browser access; semua lewat SECURITY DEFINER RPC.
revoke all on public.v109_employee_sessions from public, anon, authenticated;

-- Backfill binding lama yang masih ada.
insert into public.v109_employee_sessions(auth_uid,employee_id,device,is_active,created_at,last_seen_at,ended_at)
select u.auth_uid,u.id,'Legacy session',true,now(),now(),null
from public.v109_users u
where u.auth_uid is not null
on conflict(auth_uid) do update
set employee_id=excluded.employee_id,
    is_active=true,
    last_seen_at=now(),
    ended_at=null;

-- =========================================================
-- 2. SINGLE SOURCE OF TRUTH FOR CURRENT EMPLOYEE
-- =========================================================
create or replace function public.v109_session_employee_id(
  p_uid uuid default auth.uid()
)
returns uuid
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(
    (
      select s.employee_id
      from public.v109_employee_sessions s
      join public.v109_users u on u.id=s.employee_id
      where s.auth_uid=p_uid
        and s.is_active=true
        and u.is_active=true
      limit 1
    ),
    (
      -- Fallback sementara untuk session legacy sebelum migrasi.
      select u.id
      from public.v109_users u
      where u.auth_uid=p_uid
        and u.is_active=true
      limit 1
    )
  );
$$;

revoke all on function public.v109_session_employee_id(uuid) from public;
grant execute on function public.v109_session_employee_id(uuid) to authenticated;

-- Owner / employee dapat membaca row dirinya sendiri.
drop policy if exists v109_owner_select on public.v109_users;
create policy v109_owner_select
on public.v109_users
for select
to authenticated
using(
  public.v109_is_owner()
  or id=public.v109_session_employee_id(auth.uid())
);

-- =========================================================
-- 3. BIND / CURRENT PROFILE / LOGOUT
-- =========================================================
create or replace function public.v109_bind_employee_session(
  p_login_token text
)
returns boolean
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_id uuid;
  v_device text;
begin
  if auth.uid() is null then
    raise exception 'Sesi Supabase belum aktif.';
  end if;

  select id into v_id
  from public.v109_users
  where login_token_hash=encode(digest(p_login_token,'sha256'),'hex')
    and login_token_expires_at>now()
    and is_active=true
  for update;

  if v_id is null then
    return false;
  end if;

  -- Session auth UID ini hanya boleh menunjuk ke satu employee,
  -- tetapi SATU employee boleh punya banyak auth UID/device aktif.
  insert into public.v109_employee_sessions(
    auth_uid,employee_id,device,is_active,created_at,last_seen_at,ended_at
  )
  values(
    auth.uid(),v_id,null,true,now(),now(),null
  )
  on conflict(auth_uid) do update
  set employee_id=excluded.employee_id,
      is_active=true,
      last_seen_at=now(),
      ended_at=null;

  update public.v109_users
  set login_token_hash=null,
      login_token_expires_at=null,
      last_login_at=now(),
      updated_at=now()
  where id=v_id;

  -- auth_uid lama dipertahankan hanya sebagai kompatibilitas "last session".
  -- Aplikasi stabil tidak lagi bergantung pada kolom ini.
  update public.v109_users
  set auth_uid=auth.uid()
  where id=v_id;

  return true;
end;
$$;

revoke all on function public.v109_bind_employee_session(text) from public;
grant execute on function public.v109_bind_employee_session(text) to authenticated;

create or replace function public.v109_current_employee()
returns table(
  id uuid,
  full_name text,
  login_id text,
  is_active boolean,
  dashboard boolean,
  cashier boolean,
  orders boolean,
  qr_center boolean,
  production boolean,
  customers boolean,
  services boolean,
  payments boolean,
  receivables boolean,
  finance boolean,
  cash boolean,
  reports boolean,
  backup boolean,
  settings boolean
)
language sql
stable
security definer
set search_path=public
as $$
  select
    u.id,u.full_name,u.login_id,u.is_active,
    u.dashboard,u.cashier,u.orders,u.qr_center,u.production,u.customers,u.services,
    u.payments,u.receivables,u.finance,u.cash,u.reports,u.backup,u.settings
  from public.v109_users u
  where u.id=public.v109_session_employee_id(auth.uid())
    and u.is_active=true
  limit 1;
$$;

grant execute on function public.v109_current_employee() to authenticated;

create or replace function public.v109_employee_logout()
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_employee_id uuid;
begin
  v_employee_id:=public.v109_session_employee_id(auth.uid());

  update public.v109_employee_sessions
  set is_active=false,
      last_seen_at=now(),
      ended_at=now()
  where auth_uid=auth.uid()
    and is_active=true;

  if v_employee_id is not null then
    update public.v109_users
    set last_logout_at=now(),
        auth_uid=case when auth_uid=auth.uid() then null else auth_uid end,
        updated_at=now()
    where id=v_employee_id;
  end if;

  return true;
end;
$$;

grant execute on function public.v109_employee_logout() to authenticated;

-- =========================================================
-- 4. PASSWORD RESET / DEACTIVATE MUST END ALL EMPLOYEE SESSIONS
-- =========================================================
create or replace function public.v109_owner_reset_employee_password(
  p_employee_id uuid,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_is_owner boolean := false;
  v_employee_exists boolean := false;
  v_login_id text;
  v_full_name text;
begin
  if auth.uid() is null then
    raise exception 'Sesi login tidak valid. Silakan login ulang sebagai Owner.';
  end if;

  select exists(
    select 1
    from public.profiles p
    where p.id=auth.uid()
      and lower(coalesce(p.role,''))='owner'
  ) into v_is_owner;

  if not v_is_owner then
    raise exception 'Hanya Owner yang dapat reset password karyawan.';
  end if;

  if p_employee_id is null then
    raise exception 'ID karyawan tidak valid.';
  end if;

  if length(coalesce(p_new_password,''))<8 then
    raise exception 'Password minimal 8 karakter.';
  end if;

  select exists(
    select 1 from public.v109_users u where u.id=p_employee_id
  ) into v_employee_exists;

  if not v_employee_exists then
    raise exception 'Data karyawan tidak ditemukan.';
  end if;

  select login_id,full_name
  into v_login_id,v_full_name
  from public.v109_users
  where id=p_employee_id;

  update public.v109_employee_sessions
  set is_active=false,last_seen_at=now(),ended_at=now()
  where employee_id=p_employee_id
    and is_active=true;

  update public.v109_users
  set password_hash=crypt(p_new_password,gen_salt('bf',10)),
      failed_login_count=0,
      locked_until=null,
      login_token_hash=null,
      login_token_expires_at=null,
      auth_uid=null,
      last_logout_at=now(),
      updated_at=now()
  where id=p_employee_id;

  if not found then
    raise exception 'Reset password gagal: data karyawan tidak berhasil diperbarui.';
  end if;

  if to_regclass('public.v109_audit_log') is not null then
    insert into public.v109_audit_log(
      employee_id,login_id,full_name,action,entity_type,entity_id,details
    )
    values(
      p_employee_id,v_login_id,v_full_name,
      'RESET_EMPLOYEE_PASSWORD_ALL_SESSIONS',
      'employee',p_employee_id::text,
      'Owner reset password dan memutus seluruh session employee aktif.'
    );
  end if;

  return true;
end;
$$;

revoke all on function public.v109_owner_reset_employee_password(uuid,text) from public;
revoke execute on function public.v109_owner_reset_employee_password(uuid,text) from anon;
grant execute on function public.v109_owner_reset_employee_password(uuid,text) to authenticated;

create or replace function public.v109_set_employee_active(
  p_id uuid,
  p_active boolean
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.v109_is_owner() then
    raise exception 'Hanya Owner yang dapat mengubah status akun.';
  end if;

  update public.v109_users
  set is_active=p_active,
      auth_uid=case when p_active then auth_uid else null end,
      updated_at=now()
  where id=p_id;

  if not found then
    return false;
  end if;

  if not p_active then
    update public.v109_employee_sessions
    set is_active=false,last_seen_at=now(),ended_at=now()
    where employee_id=p_id
      and is_active=true;
  end if;

  return true;
end;
$$;

grant execute on function public.v109_set_employee_active(uuid,boolean) to authenticated;

-- =========================================================
-- 5. AUDIT / PERMISSION HELPERS USE SESSION TABLE
-- =========================================================
create or replace function public.v109_log_activity(
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_details text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  u public.v109_users%rowtype;
begin
  select * into u
  from public.v109_users
  where id=public.v109_session_employee_id(auth.uid())
  limit 1;

  if not found then return false; end if;

  insert into public.v109_audit_log(
    employee_id,login_id,full_name,action,entity_type,entity_id,details
  ) values(
    u.id,u.login_id,u.full_name,p_action,p_entity_type,p_entity_id,p_details
  );

  update public.v109_employee_sessions
  set last_seen_at=now()
  where auth_uid=auth.uid() and is_active=true;

  return true;
end;
$$;

grant execute on function public.v109_log_activity(text,text,text,text) to authenticated;

create or replace function public.v110_can_use_qr_center()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    exists(
      select 1 from public.profiles p
      where p.id=auth.uid() and p.role='owner'
    )
    or exists(
      select 1 from public.v109_users u
      where u.id=public.v109_session_employee_id(auth.uid())
        and u.is_active=true
        and u.qr_center=true
    );
$$;

grant execute on function public.v110_can_use_qr_center() to authenticated;

create or replace function public.v11304_can_manage_expenses()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    public.v109_is_owner()
    or exists(
      select 1 from public.v109_users u
      where u.id=public.v109_session_employee_id(auth.uid())
        and u.is_active=true
        and u.finance=true
    );
$$;

grant execute on function public.v11304_can_manage_expenses() to authenticated;

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
      select 1 from public.v109_users u
      where u.id=public.v109_session_employee_id(auth.uid())
        and u.is_active=true
        and coalesce(u.finance,false)=true
    );
$$;

grant execute on function public.v113122_can_manage_cash_advance() to authenticated;

-- =========================================================
-- 6. ATTENDANCE: RESOLVE EMPLOYEE FROM SESSION TABLE
-- =========================================================
create or replace function public.v11322_current_attendance_state()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  e public.v109_users%rowtype;
  s public.v112_attendance_settings%rowtype;
  a public.v111_attendance%rowtype;
  d date;
  local_now timestamp;
  local_time time;
  logout_local timestamp;
begin
  select * into e
  from public.v109_users
  where id=public.v109_session_employee_id(auth.uid())
    and is_active=true
  limit 1;

  if not found then
    return jsonb_build_object(
      'attendance_required',false,
      'employee',false,
      'session_valid',false
    );
  end if;

  update public.v109_employee_sessions
  set last_seen_at=now()
  where auth_uid=auth.uid() and is_active=true;

  select * into s from public.v112_attendance_settings where id=1;
  local_now:=now() at time zone 'Asia/Jakarta';
  d:=local_now::date;
  local_time:=local_now::time;

  select * into a
  from public.v111_attendance
  where employee_id=e.id and attendance_date=d
  limit 1;

  logout_local:=d::timestamp+s.attendance_end+
    make_interval(mins=>coalesce(s.auto_logout_grace_minutes,15));

  return jsonb_build_object(
    'employee',true,
    'session_valid',true,
    'employee_id',e.id,
    'attendance_required',coalesce(e.attendance_required,true),
    'attended_today',a.id is not null,
    'checked_out',a.check_out_at is not null,
    'check_in_at',a.check_in_at,
    'check_out_at',a.check_out_at,
    'work_start',to_char(s.attendance_start,'HH24:MI'),
    'work_end',to_char(s.attendance_end,'HH24:MI'),
    'enforce_work_hours',s.enforce_time,
    'within_work_hours',(not s.enforce_time) or (local_time>=s.attendance_start and local_time<=s.attendance_end),
    'grace_minutes',coalesce(s.auto_logout_grace_minutes,15),
    'logout_at',to_char(logout_local,'YYYY-MM-DD"T"HH24:MI:SS')||'+07:00'
  );
end;
$$;

grant execute on function public.v11322_current_attendance_state() to authenticated;

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
  e public.v109_users%rowtype;
  s public.v112_attendance_settings%rowtype;
  a public.v111_attendance%rowtype;
  d date;
  local_time time;
  lat1 double precision;
  lat2 double precision;
  dlat double precision;
  dlon double precision;
  hav double precision;
  arc double precision;
  distance double precision;
begin
  select * into e
  from public.v109_users
  where id=public.v109_session_employee_id(auth.uid())
    and is_active=true
  limit 1;

  if not found then
    raise exception 'Sesi karyawan tidak valid. Silakan login ulang.';
  end if;

  update public.v109_employee_sessions
  set last_seen_at=now(),device=coalesce(nullif(btrim(p_device),''),device)
  where auth_uid=auth.uid() and is_active=true;

  if coalesce(e.attendance_required,true)=false then
    return jsonb_build_object(
      'ok',true,'created',false,'action','exempt',
      'message','Akun ini dibebaskan Owner dari kewajiban absensi.'
    );
  end if;

  select * into s from public.v112_attendance_settings where id=1;

  if s.latitude is null or s.longitude is null then
    raise exception 'Lokasi toko belum diatur oleh Owner.';
  end if;

  if coalesce(btrim(p_qr_token),'')='' or p_qr_token<>s.qr_token then
    raise exception 'QR Absen tidak valid atau sudah diganti Owner.';
  end if;

  if p_latitude is null or p_longitude is null then
    raise exception 'GPS wajib aktif untuk absensi.';
  end if;

  lat1:=radians(s.latitude);
  lat2:=radians(p_latitude);
  dlat:=radians(p_latitude-s.latitude);
  dlon:=radians(p_longitude-s.longitude);
  hav:=sin(dlat/2)^2+cos(lat1)*cos(lat2)*sin(dlon/2)^2;
  arc:=2*atan2(sqrt(hav),sqrt(1-hav));
  distance:=6371000*arc;

  if distance>s.radius_meters then
    raise exception 'Anda berada di luar area HappyLaundry. Jarak sekitar % meter, batas % meter.',
      round(distance)::integer,s.radius_meters;
  end if;

  if p_accuracy_meters is not null and p_accuracy_meters>300 then
    raise exception 'Akurasi GPS terlalu rendah (% meter). Coba ulangi.',
      round(p_accuracy_meters)::integer;
  end if;

  d:=(now() at time zone 'Asia/Jakarta')::date;
  local_time:=(now() at time zone 'Asia/Jakarta')::time;

  select * into a
  from public.v111_attendance
  where employee_id=e.id and attendance_date=d
  limit 1;

  if not found then
    if s.enforce_time and (local_time<s.attendance_start or local_time>s.attendance_end) then
      raise exception 'Absensi ditolak — di luar jam kerja (% - %).',
        to_char(s.attendance_start,'HH24:MI'),
        to_char(s.attendance_end,'HH24:MI');
    end if;

    insert into public.v111_attendance(
      employee_id,attendance_date,status,note,attendance_source,check_in_at,
      gps_latitude,gps_longitude,gps_accuracy_meters,distance_meters,
      attendance_device,qr_version,created_at,updated_at
    ) values(
      e.id,d,'present','Absen Masuk QR + GPS','qr_gps',now(),
      p_latitude,p_longitude,p_accuracy_meters,distance,
      nullif(btrim(coalesce(p_device,'')),''),s.qr_version,now(),now()
    );

    insert into public.v109_audit_log(
      employee_id,login_id,full_name,action,entity_type,entity_id,details
    ) values(
      e.id,e.login_id,e.full_name,
      'ATTENDANCE_CHECK_IN','attendance',d::text,
      'Absen Masuk via QR + GPS.'
    );

    return jsonb_build_object(
      'ok',true,'created',true,'action','check_in','status','present',
      'attendance_date',d,'check_in_at',now(),'distance_meters',distance,
      'message','Absen Masuk berhasil.'
    );
  end if;

  if a.check_out_at is null then
    update public.v111_attendance
    set check_out_at=now(),
        check_out_source='qr_gps',
        updated_at=now(),
        note=coalesce(note,'')||' | Absen Pulang QR + GPS'
    where id=a.id;

    insert into public.v109_audit_log(
      employee_id,login_id,full_name,action,entity_type,entity_id,details
    ) values(
      e.id,e.login_id,e.full_name,
      'ATTENDANCE_CHECK_OUT','attendance',d::text,
      'Absen Pulang via QR + GPS.'
    );

    return jsonb_build_object(
      'ok',true,'created',false,'action','check_out','status',a.status,
      'attendance_date',d,'check_in_at',a.check_in_at,'check_out_at',now(),
      'distance_meters',distance,'message','Absen Pulang berhasil.'
    );
  end if;

  return jsonb_build_object(
    'ok',true,'created',false,'action','already_done','status',a.status,
    'attendance_date',d,'check_in_at',a.check_in_at,'check_out_at',a.check_out_at,
    'distance_meters',coalesce(a.distance_meters,distance),
    'message','Absen Masuk dan Pulang hari ini sudah tercatat.'
  );
end;
$$;

grant execute on function public.v112_record_qr_gps_attendance(
  text,double precision,double precision,double precision,text
) to authenticated;

-- Legacy auto attendance helper also uses the new session resolver.
create or replace function public.v111_auto_attendance_login()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_employee public.v109_users%rowtype;
  v_date date;
  v_row_count integer:=0;
  v_inserted boolean:=false;
begin
  select * into v_employee
  from public.v109_users
  where id=public.v109_session_employee_id(auth.uid())
    and is_active=true
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'reason','not_employee');
  end if;

  v_date:=(now() at time zone 'Asia/Jakarta')::date;

  select count(*) into v_row_count
  from public.v111_attendance
  where employee_id=v_employee.id
    and attendance_date=v_date;

  if v_row_count=0 then
    return jsonb_build_object(
      'ok',true,'inserted',false,'employee_id',v_employee.id,
      'reason','manual_qr_required'
    );
  end if;

  return jsonb_build_object(
    'ok',true,'inserted',v_inserted,'employee_id',v_employee.id
  );
end;
$$;

grant execute on function public.v111_auto_attendance_login() to authenticated;

-- =========================================================
-- 7. DAILY CLOSING / ACTOR RESOLUTION
-- =========================================================
create or replace function public.v11324_can_close()
returns boolean
language sql
security definer
stable
set search_path=public
as $$
  select public.v109_is_owner()
  or exists(
    select 1 from public.v109_users u
    where u.id=public.v109_session_employee_id(auth.uid())
      and u.is_active=true
      and u.cash=true
  );
$$;

grant execute on function public.v11324_can_close() to authenticated;

create or replace function public.v11324_actor_name()
returns text
language sql
security definer
stable
set search_path=public
as $$
  select coalesce(
    (select p.full_name from public.profiles p where p.id=auth.uid() limit 1),
    (
      select u.full_name
      from public.v109_users u
      where u.id=public.v109_session_employee_id(auth.uid())
        and u.is_active=true
      limit 1
    ),
    'Pengguna'
  );
$$;

grant execute on function public.v11324_actor_name() to authenticated;

drop policy if exists v11324_closing_select on public.v11324_daily_closings;
create policy v11324_closing_select
on public.v11324_daily_closings
for select
to authenticated
using(public.v11324_can_close());

-- =========================================================
-- 8. USER NAME LOOKUP FOR APPROVAL/AUDIT
-- =========================================================
create or replace function public.v11306_user_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(
    (select p.full_name from public.profiles p where p.id=p_uid limit 1),
    (
      select u.full_name
      from public.v109_employee_sessions s
      join public.v109_users u on u.id=s.employee_id
      where s.auth_uid=p_uid
      order by s.last_seen_at desc
      limit 1
    ),
    (select u.full_name from public.v109_users u where u.auth_uid=p_uid limit 1),
    'Pengguna'
  );
$$;

grant execute on function public.v11306_user_name(uuid) to authenticated;

notify pgrst,'reload schema';

commit;
