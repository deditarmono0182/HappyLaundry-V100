-- HappyLaundry Enterprise V113.0.22
-- Jam Kerja + Wajib Absensi per Karyawan + Absen Pulang + Auto Logout
-- Jalankan setelah SQL 037.

-- 1) Per-karyawan: Owner bisa memilih wajib absensi atau bebas.
alter table public.v109_users
  add column if not exists attendance_required boolean not null default true;

-- 2) Jam kerja memakai kolom attendance_start/end lama agar histori/settings tetap kompatibel.
alter table public.v112_attendance_settings
  add column if not exists auto_logout_grace_minutes integer not null default 15
  check(auto_logout_grace_minutes between 0 and 120);

-- Untuk instalasi yang masih memakai default lama 06:00-11:00,
-- migrasikan menjadi jam kerja 07:00-21:00.
update public.v112_attendance_settings
set attendance_start='07:00',
    attendance_end='21:00',
    enforce_time=true,
    auto_logout_grace_minutes=coalesce(auto_logout_grace_minutes,15),
    updated_at=now()
where id=1
  and attendance_start='06:00'
  and attendance_end='11:00';

-- 3) Catat jam pulang sebenarnya.
alter table public.v111_attendance
  add column if not exists check_out_at timestamptz null;

alter table public.v111_attendance
  add column if not exists check_out_source text null;

-- Owner-only setter, terpisah dari hak akses menu.
create or replace function public.v11322_set_employee_attendance_required(
  p_employee_id uuid,
  p_required boolean
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.v109_is_owner() then
    raise exception 'Hanya Owner yang dapat mengatur kewajiban absensi.';
  end if;

  update public.v109_users
  set attendance_required=coalesce(p_required,true),updated_at=now()
  where id=p_employee_id;

  if not found then raise exception 'Karyawan tidak ditemukan.'; end if;

  insert into public.v109_audit_log(action,entity_type,entity_id,details)
  values(
    'SET_ATTENDANCE_REQUIRED','employee',p_employee_id::text,
    case when p_required then 'Owner mengaktifkan Wajib Absensi Harian.'
         else 'Owner membebaskan karyawan dari absensi dan batas jam kerja.' end
  );

  return true;
end;
$$;
grant execute on function public.v11322_set_employee_attendance_required(uuid,boolean) to authenticated;

-- State tunggal yang dipakai aplikasi untuk gate akses dan auto logout.
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
  select * into e from public.v109_users where auth_uid=auth.uid() and is_active=true limit 1;
  if not found then
    return jsonb_build_object('attendance_required',false,'employee',false);
  end if;

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
    -- ISO string interpreted as Jakarta offset by JS.
    'logout_at',to_char(logout_local,'YYYY-MM-DD"T"HH24:MI:SS')||'+07:00'
  );
end;
$$;
grant execute on function public.v11322_current_attendance_state() to authenticated;

-- 4) Upgrade QR + GPS: scan pertama = masuk, scan kedua = pulang.
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
  lat1 double precision; lat2 double precision; dlat double precision; dlon double precision;
  hav double precision; arc double precision; distance double precision;
begin
  select * into e from public.v109_users
  where auth_uid=auth.uid() and is_active=true limit 1;
  if not found then raise exception 'Sesi karyawan tidak valid. Silakan login ulang.'; end if;

  if coalesce(e.attendance_required,true)=false then
    return jsonb_build_object('ok',true,'created',false,'action','exempt','message','Akun ini dibebaskan Owner dari kewajiban absensi.');
  end if;

  select * into s from public.v112_attendance_settings where id=1;
  if s.latitude is null or s.longitude is null then raise exception 'Lokasi toko belum diatur oleh Owner.'; end if;
  if coalesce(btrim(p_qr_token),'')='' or p_qr_token<>s.qr_token then raise exception 'QR Absen tidak valid atau sudah diganti Owner.'; end if;
  if p_latitude is null or p_longitude is null then raise exception 'GPS wajib aktif untuk absensi.'; end if;

  lat1:=radians(s.latitude); lat2:=radians(p_latitude);
  dlat:=radians(p_latitude-s.latitude); dlon:=radians(p_longitude-s.longitude);
  hav:=sin(dlat/2)^2+cos(lat1)*cos(lat2)*sin(dlon/2)^2;
  arc:=2*atan2(sqrt(hav),sqrt(1-hav));
  distance:=6371000*arc;

  if distance>s.radius_meters then
    raise exception 'Anda berada di luar area HappyLaundry. Jarak sekitar % meter, batas % meter.',
      round(distance)::integer,s.radius_meters;
  end if;
  if p_accuracy_meters is not null and p_accuracy_meters>300 then
    raise exception 'Akurasi GPS terlalu rendah (% meter). Coba ulangi.',round(p_accuracy_meters)::integer;
  end if;

  d:=(now() at time zone 'Asia/Jakarta')::date;
  local_time:=(now() at time zone 'Asia/Jakarta')::time;

  select * into a from public.v111_attendance where employee_id=e.id and attendance_date=d limit 1;

  -- Belum masuk: wajib dalam jam kerja.
  if not found then
    if s.enforce_time and (local_time<s.attendance_start or local_time>s.attendance_end) then
      raise exception 'Absensi ditolak — di luar jam kerja (% - %).',
        to_char(s.attendance_start,'HH24:MI'),to_char(s.attendance_end,'HH24:MI');
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

    insert into public.v109_audit_log(employee_id,login_id,full_name,action,entity_type,entity_id,details)
    values(e.id,e.login_id,e.full_name,'ATTENDANCE_CHECK_IN','attendance',d::text,'Absen Masuk via QR + GPS.');

    return jsonb_build_object(
      'ok',true,'created',true,'action','check_in','status','present',
      'attendance_date',d,'check_in_at',now(),'distance_meters',distance,
      'message','Absen Masuk berhasil.'
    );
  end if;

  -- Sudah masuk, belum pulang: scan berikutnya = pulang.
  if a.check_out_at is null then
    update public.v111_attendance
    set check_out_at=now(),check_out_source='qr_gps',updated_at=now(),
        note=coalesce(note,'')||' | Absen Pulang QR + GPS'
    where id=a.id;

    insert into public.v109_audit_log(employee_id,login_id,full_name,action,entity_type,entity_id,details)
    values(e.id,e.login_id,e.full_name,'ATTENDANCE_CHECK_OUT','attendance',d::text,'Absen Pulang via QR + GPS.');

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

notify pgrst,'reload schema';
