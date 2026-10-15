-- HappyLaundry V113.0.132
-- SQL 070 - GPS Auto Attendance
-- Syarat: SQL 069 Multi-Device Employee Session Stability sudah dijalankan.
-- Tujuan: karyawan tidak lagi memakai kamera/QR untuk absen.
-- Login -> GPS -> Absen Masuk otomatis jika berada dalam radius toko.
-- Absen Pulang dilakukan dari tombol GPS di halaman Absen.

begin;

create or replace function public.v113070_record_gps_attendance(
  p_action text,
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
  v_action text := lower(coalesce(nullif(btrim(p_action),''),'check_in'));
  lat1 double precision;
  lat2 double precision;
  dlat double precision;
  dlon double precision;
  hav double precision;
  arc double precision;
  distance double precision;
begin
  if v_action not in ('check_in','check_out') then
    raise exception 'Aksi absensi tidak valid.';
  end if;

  select * into e
  from public.v109_users
  where id=public.v109_session_employee_id(auth.uid())
    and is_active=true
  limit 1;

  if not found then
    raise exception 'Sesi karyawan tidak valid. Silakan login ulang.';
  end if;

  update public.v109_employee_sessions
  set last_seen_at=now(),
      device=coalesce(nullif(btrim(p_device),''),device)
  where auth_uid=auth.uid()
    and is_active=true;

  if coalesce(e.attendance_required,true)=false then
    return jsonb_build_object(
      'ok',true,
      'action','exempt',
      'attendance_required',false,
      'message','Akun ini dibebaskan Owner dari kewajiban absensi.'
    );
  end if;

  select * into s
  from public.v112_attendance_settings
  where id=1;

  if not found then
    raise exception 'Pengaturan absensi belum tersedia.';
  end if;

  if s.latitude is null or s.longitude is null then
    raise exception 'Lokasi toko belum diatur oleh Owner.';
  end if;

  if p_latitude is null or p_longitude is null then
    raise exception 'GPS wajib aktif untuk absensi.';
  end if;

  if p_accuracy_meters is not null and p_accuracy_meters>300 then
    raise exception 'Akurasi GPS terlalu rendah (% meter). Coba ulangi.',
      round(p_accuracy_meters)::integer;
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

  d:=(now() at time zone 'Asia/Jakarta')::date;
  local_time:=(now() at time zone 'Asia/Jakarta')::time;

  select * into a
  from public.v111_attendance
  where employee_id=e.id
    and attendance_date=d
  limit 1;

  if v_action='check_in' then
    if found then
      return jsonb_build_object(
        'ok',true,
        'action',case when a.check_out_at is null then 'already_checked_in' else 'already_done' end,
        'attendance_date',d,
        'check_in_at',a.check_in_at,
        'check_out_at',a.check_out_at,
        'distance_meters',coalesce(a.distance_meters,distance),
        'message',case when a.check_out_at is null
          then 'Absen Masuk hari ini sudah tercatat.'
          else 'Absen Masuk dan Pulang hari ini sudah tercatat.'
        end
      );
    end if;

    if s.enforce_time and (local_time<s.attendance_start or local_time>s.attendance_end) then
      raise exception 'Absen Masuk ditolak — di luar jam kerja (% - %).',
        to_char(s.attendance_start,'HH24:MI'),
        to_char(s.attendance_end,'HH24:MI');
    end if;

    insert into public.v111_attendance(
      employee_id,attendance_date,status,note,attendance_source,check_in_at,
      gps_latitude,gps_longitude,gps_accuracy_meters,distance_meters,
      attendance_device,qr_version,created_at,updated_at
    ) values(
      e.id,d,'present','Absen Masuk Otomatis Login + GPS','login_gps',now(),
      p_latitude,p_longitude,p_accuracy_meters,distance,
      nullif(btrim(coalesce(p_device,'')),''),null,now(),now()
    );

    insert into public.v109_audit_log(
      employee_id,login_id,full_name,action,entity_type,entity_id,details
    ) values(
      e.id,e.login_id,e.full_name,
      'ATTENDANCE_CHECK_IN_GPS','attendance',d::text,
      'Absen Masuk otomatis setelah login dengan verifikasi GPS.'
    );

    return jsonb_build_object(
      'ok',true,
      'created',true,
      'action','check_in',
      'status','present',
      'attendance_date',d,
      'check_in_at',now(),
      'distance_meters',distance,
      'message','Absen Masuk otomatis berhasil.'
    );
  end if;

  -- check_out
  if not found then
    raise exception 'Belum ada Absen Masuk hari ini.';
  end if;

  if a.check_out_at is not null then
    return jsonb_build_object(
      'ok',true,
      'action','already_done',
      'attendance_date',d,
      'check_in_at',a.check_in_at,
      'check_out_at',a.check_out_at,
      'distance_meters',coalesce(a.distance_meters,distance),
      'message','Absen Pulang hari ini sudah tercatat.'
    );
  end if;

  update public.v111_attendance
  set check_out_at=now(),
      check_out_source='gps',
      updated_at=now(),
      note=trim(both ' ' from coalesce(note,'')||' | Absen Pulang GPS')
  where id=a.id;

  insert into public.v109_audit_log(
    employee_id,login_id,full_name,action,entity_type,entity_id,details
  ) values(
    e.id,e.login_id,e.full_name,
    'ATTENDANCE_CHECK_OUT_GPS','attendance',d::text,
    'Absen Pulang dengan verifikasi GPS.'
  );

  return jsonb_build_object(
    'ok',true,
    'created',false,
    'action','check_out',
    'status',a.status,
    'attendance_date',d,
    'check_in_at',a.check_in_at,
    'check_out_at',now(),
    'distance_meters',distance,
    'message','Absen Pulang berhasil.'
  );
end;
$$;

revoke all on function public.v113070_record_gps_attendance(
  text,double precision,double precision,double precision,text
) from public;
grant execute on function public.v113070_record_gps_attendance(
  text,double precision,double precision,double precision,text
) to authenticated;

notify pgrst,'reload schema';

commit;
