import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite()
const employee='00000000-0000-0000-0000-000000000001',uid='00000000-0000-0000-0000-000000000011',uid2='00000000-0000-0000-0000-000000000012'
await db.exec(`create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create table v109_users(id uuid primary key,login_id text,full_name text,is_active boolean,attendance_required boolean);
create table v109_employee_sessions(auth_uid uuid primary key,employee_id uuid,is_active boolean,last_seen_at timestamptz,device text);
create function v109_session_employee_id(p uuid) returns uuid language sql as $$select employee_id from v109_employee_sessions where auth_uid=p and is_active$$;
create table v112_attendance_settings(id int,latitude float8,longitude float8,radius_meters int,enforce_time boolean,attendance_start time,attendance_end time,auto_logout_grace_minutes int);
create table v111_attendance(id uuid primary key default gen_random_uuid(),employee_id uuid,attendance_date date,status text,note text,attendance_source text not null default 'manual',check_in_at timestamptz,check_out_at timestamptz,check_out_source text,gps_latitude float8,gps_longitude float8,gps_accuracy_meters float8,distance_meters float8,attendance_device text,qr_version text,created_at timestamptz,updated_at timestamptz,
unique(employee_id,attendance_date),constraint v111_attendance_source_check check(attendance_source in('manual','login','owner_override','qr_gps')));
create table v109_audit_log(employee_id uuid,login_id text,full_name text,action text,entity_type text,entity_id text,details text);
insert into v109_users values('${employee}','Robet','Robet',true,true);
insert into v109_employee_sessions(auth_uid,employee_id,is_active) values('${uid}','${employee}',true),('${uid2}','${employee}',true);
insert into v112_attendance_settings values(1,-6.7,108.5,100,false,'00:00','23:59:59',15);
set test.uid='${uid}';`)
await db.exec(await readFile('supabase/070_v113_0_132_gps_auto_attendance.sql','utf8'))
const call=async(action='check_in',lat=-6.7,lon=108.5,accuracy=29)=>(await db.query(`select v113070_record_gps_attendance($1,$2,$3,$4,'Test') value`,[action,lat,lon,accuracy])).rows[0].value
await assert.rejects(()=>call(),/v111_attendance_source_check/)
const oldState=await readFile('supabase/069_v113_0_131_multi_device_employee_session_stability.sql','utf8')
await db.exec(oldState.slice(oldState.indexOf('create or replace function public.v11322_current_attendance_state()'),oldState.indexOf('create or replace function public.v112_record_qr_gps_attendance(')))
assert.equal((await db.query('select v11322_current_attendance_state() value')).rows[0].value.session_valid,true)
const fix=await readFile('supabase/076_v113_0_140_attendance_stability.sql','utf8');await db.exec(fix);await db.exec(fix)
// Historical attendance and its source must remain unchanged.
await db.exec(`insert into v111_attendance(employee_id,attendance_date,status,attendance_source) values('${employee}',(now() at time zone 'Asia/Jakarta')::date-1,'present','owner_override')`)
assert.equal((await call()).action,'check_in')
assert.equal((await call()).action,'already_checked_in')
await db.exec(`set test.uid='${uid2}'`);assert.equal((await call()).action,'already_checked_in')
assert.equal((await call('check_out')).action,'check_out')
assert.equal((await call('check_out')).action,'already_done')
assert.equal((await call()).action,'already_done','completed attendance is never reopened')
assert.equal((await db.query('select count(*)::int n from v109_audit_log')).rows[0].n,2,'one check-in and one checkout audit')
const attendanceState=(await db.query('select v11322_current_attendance_state() value')).rows[0].value
assert.equal(attendanceState.session_valid,true);assert.equal(attendanceState.checked_out,true);assert.equal(attendanceState.attended_today,true);assert.match(attendanceState.logout_at,/T00:14:59\+07:00$/);assert.ok(attendanceState.attendance_date)
const rows=(await db.query('select * from v111_attendance order by attendance_date')).rows
assert.equal(rows.length,2);assert.equal(rows[0].attendance_source,'owner_override');assert.equal(rows[1].attendance_source,'login_gps');assert.equal(rows[1].check_out_source,'gps')
await assert.rejects(()=>call('check_in',-6,108.5),/luar area/)
await assert.rejects(()=>call('check_in',100,108.5),/Koordinat/)
await assert.rejects(()=>call('check_in',-6.7,108.5,301),/Akurasi/)
await assert.rejects(()=>call('check_in',-6.7,108.5,-1),/Akurasi/)
await assert.rejects(()=>call('invalid'),/Aksi/)
// Separate employee for no-check-in, working hours, and exemption.
const other='00000000-0000-0000-0000-000000000002'
await db.exec(`insert into v109_users values('${other}','Haris','Haris',true,true);update v109_employee_sessions set employee_id='${other}' where auth_uid='${uid2}';`)
await assert.rejects(()=>call('check_out'),/Belum ada Absen Masuk/)
await db.exec(`update v112_attendance_settings set enforce_time=true,attendance_start='23:59:59',attendance_end='00:00'`)
await assert.rejects(()=>call(),/luar jam kerja/)
await db.exec(`update v109_users set attendance_required=false where id='${other}'`);assert.equal((await call('check_in',null,null)).action,'exempt')
await db.exec(`update v109_employee_sessions set is_active=false where auth_uid='${uid2}'`);await assert.rejects(()=>call(),/Sesi karyawan tidak valid/);assert.equal((await db.query('select v11322_current_attendance_state() value')).rows[0].value.session_valid,false)
console.log('PASS SQL: old GPS error reproduced; repeatable migration; GPS check-in/out; repeated requests and second device; completed day; WIB historical date; audit once; radius/time/accuracy controls; exempt and invalid sessions.')
await db.close()
