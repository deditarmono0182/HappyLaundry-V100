-- HappyLaundry V113.0.169. Jalankan setelah SQL 083 dan 085.
-- Menambah identitas pengaju dan tanda sudah dibaca saja; tidak mengubah saldo.
begin;
alter table public.v113161_cash_advance_requests add column if not exists requester_employee_id uuid;
alter table public.v113163_cash_advance_addition_requests add column if not exists requester_employee_id uuid;
create or replace function public.v113169_capture_requester()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 select id into new.requester_employee_id from public.v109_users where auth_uid=new.requested_by limit 1;
 return new;
end;$$;
revoke all on function public.v113169_capture_requester() from public,anon,authenticated;
drop trigger if exists v113169_requester on public.v113161_cash_advance_requests;
create trigger v113169_requester before insert on public.v113161_cash_advance_requests for each row execute function public.v113169_capture_requester();
drop trigger if exists v113169_requester on public.v113163_cash_advance_addition_requests;
create trigger v113169_requester before insert on public.v113163_cash_advance_addition_requests for each row execute function public.v113169_capture_requester();
update public.v113161_cash_advance_requests r set requester_employee_id=u.id from public.v109_users u where r.requester_employee_id is null and u.auth_uid=r.requested_by;
update public.v113163_cash_advance_addition_requests r set requester_employee_id=u.id from public.v109_users u where r.requester_employee_id is null and u.auth_uid=r.requested_by;
create table if not exists public.v113169_cash_advance_notice_reads(
 actor_key text not null,notice_key text not null,read_at timestamptz not null default now(),
 primary key(actor_key,notice_key)
);
alter table public.v113169_cash_advance_notice_reads enable row level security;
revoke all on public.v113169_cash_advance_notice_reads from public,anon,authenticated;

create or replace function public.v113169_cash_advance_notices()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare employee uuid;actor text;result jsonb;owner boolean;
begin
 if auth.uid() is null or not public.v113122_can_manage_cash_advance() then raise exception 'Akses Keuangan diperlukan.';end if;
 owner:=public.v109_is_owner();
 select id into employee from public.v109_users where auth_uid=auth.uid() and is_active=true limit 1;
 actor:=case when employee is not null then 'employee:'||employee else 'auth:'||auth.uid() end;
 with requests as (
  select 'addition' kind,id,employee_name,amount,requested_by,requester_employee_id,requester_name,requested_at,status,reviewed_at,review_note from public.v113163_cash_advance_addition_requests
  union all
  select 'correction',id,employee_name,new_amount,requested_by,requester_employee_id,requester_name,requested_at,status,reviewed_at,review_note from public.v113161_cash_advance_requests
 ), notices as (
  select *,kind||':'||id||':'||status notice_key from requests
  where (owner and status='pending') or
   (status<>'pending' and (requested_by=auth.uid() or (employee is not null and requester_employee_id=employee)))
 ), unread as (
  select * from notices n where (owner and n.status='pending') or not exists(
   select 1 from public.v113169_cash_advance_notice_reads r where r.actor_key=actor and r.notice_key=n.notice_key
  )
 ) select jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object(
  'key',notice_key,'kind',kind,'request_id',id,'employee_name',employee_name,'amount',amount,
  'requester_name',requester_name,'status',status,'time',coalesce(reviewed_at,requested_at),'review_note',review_note
 ) order by coalesce(reviewed_at,requested_at) desc,notice_key),'[]'::jsonb),'count',count(*)) into result from unread;
 return result;
end;$$;
revoke all on function public.v113169_cash_advance_notices() from public,anon;
grant execute on function public.v113169_cash_advance_notices() to authenticated;

create or replace function public.v113169_read_cash_advance_notice(p_key text)
returns void language plpgsql security definer set search_path=public as $$
declare employee uuid;actor text;
begin
 if auth.uid() is null or not public.v113122_can_manage_cash_advance() then raise exception 'Akses Keuangan diperlukan.';end if;
 if not exists(select 1 from jsonb_array_elements(public.v113169_cash_advance_notices()->'rows') n where n->>'key'=p_key) then return;end if;
 select id into employee from public.v109_users where auth_uid=auth.uid() and is_active=true limit 1;
 actor:=case when employee is not null then 'employee:'||employee else 'auth:'||auth.uid() end;
 insert into public.v113169_cash_advance_notice_reads(actor_key,notice_key) values(actor,p_key) on conflict do nothing;
end;$$;
revoke all on function public.v113169_read_cash_advance_notice(text) from public,anon;
grant execute on function public.v113169_read_cash_advance_notice(text) to authenticated;
notify pgrst,'reload schema';
commit;
