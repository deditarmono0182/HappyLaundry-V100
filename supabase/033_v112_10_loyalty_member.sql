-- HappyLaundry Enterprise V112.10
-- Loyalty / Member foundation
-- Jalankan sekali di Supabase SQL Editor.

alter table public.v100_customers
  add column if not exists is_member boolean not null default false,
  add column if not exists member_code text null,
  add column if not exists points_balance integer not null default 0,
  add column if not exists member_since timestamptz null;

create unique index if not exists v11210_customer_member_code_unique
on public.v100_customers(member_code) where member_code is not null;

create table if not exists public.v11210_loyalty_settings(
  id integer primary key default 1 check(id=1),
  enabled boolean not null default true,
  spend_per_point numeric(14,2) not null default 1000 check(spend_per_point>0),
  point_value numeric(14,2) not null default 100 check(point_value>=0),
  min_redeem_points integer not null default 100 check(min_redeem_points>=0),
  welcome_points integer not null default 10 check(welcome_points>=0),
  updated_at timestamptz not null default now()
);
insert into public.v11210_loyalty_settings(id) values(1) on conflict(id) do nothing;

create table if not exists public.v11210_loyalty_transactions(
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.v100_customers(id) on delete cascade,
  order_id uuid null references public.v100_orders(id) on delete set null,
  kind text not null check(kind in ('earn','welcome','adjust','redeem')),
  points integer not null,
  amount_reference numeric(14,2) null,
  note text null,
  created_by uuid null,
  created_at timestamptz not null default now()
);
create index if not exists v11210_loyalty_customer_idx on public.v11210_loyalty_transactions(customer_id,created_at desc);
create unique index if not exists v11210_loyalty_earn_order_unique on public.v11210_loyalty_transactions(order_id) where kind='earn' and order_id is not null;
create unique index if not exists v11210_loyalty_welcome_unique on public.v11210_loyalty_transactions(customer_id) where kind='welcome';

alter table public.v11210_loyalty_settings enable row level security;
alter table public.v11210_loyalty_transactions enable row level security;

drop policy if exists v11210_settings_authenticated_select on public.v11210_loyalty_settings;
create policy v11210_settings_authenticated_select on public.v11210_loyalty_settings for select to authenticated using(true);
drop policy if exists v11210_settings_owner_write on public.v11210_loyalty_settings;
create policy v11210_settings_owner_write on public.v11210_loyalty_settings for all to authenticated
using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'))
with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));

drop policy if exists v11210_transactions_authenticated_select on public.v11210_loyalty_transactions;
create policy v11210_transactions_authenticated_select on public.v11210_loyalty_transactions for select to authenticated using(true);

create or replace function public.v11210_set_membership(p_customer_id uuid,p_active boolean)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  c public.v100_customers%rowtype;
  s public.v11210_loyalty_settings%rowtype;
  code text;
  inserted_id uuid;
begin
  if auth.uid() is null then raise exception 'Login diperlukan.'; end if;
  select * into c from public.v100_customers where id=p_customer_id for update;
  if c.id is null then raise exception 'Pelanggan tidak ditemukan.'; end if;

  if p_active then
    code:=coalesce(c.member_code,'HLM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)));
    update public.v100_customers
      set is_member=true,member_code=code,member_since=coalesce(member_since,now()),updated_at=now()
      where id=c.id;

    select * into s from public.v11210_loyalty_settings where id=1;
    if coalesce(s.welcome_points,0)>0 then
      insert into public.v11210_loyalty_transactions(customer_id,kind,points,note,created_by)
      values(c.id,'welcome',s.welcome_points,'Bonus Member Baru',auth.uid())
      on conflict do nothing returning id into inserted_id;
      if inserted_id is not null then
        update public.v100_customers set points_balance=points_balance+s.welcome_points where id=c.id;
      end if;
    end if;
  else
    update public.v100_customers set is_member=false,updated_at=now() where id=c.id;
  end if;
  return true;
end $$;
grant execute on function public.v11210_set_membership(uuid,boolean) to authenticated;

create or replace function public.v11210_adjust_points(p_customer_id uuid,p_delta integer,p_note text)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  current_points integer;
  next_points integer;
begin
  if auth.uid() is null then raise exception 'Login diperlukan.'; end if;
  if p_delta=0 then raise exception 'Perubahan poin tidak boleh 0.'; end if;
  if coalesce(trim(p_note),'')='' then raise exception 'Alasan penyesuaian wajib diisi.'; end if;

  select points_balance into current_points from public.v100_customers where id=p_customer_id for update;
  if not found then raise exception 'Pelanggan tidak ditemukan.'; end if;
  next_points:=current_points+p_delta;
  if next_points<0 then raise exception 'Saldo poin tidak mencukupi.'; end if;

  update public.v100_customers set points_balance=next_points,updated_at=now() where id=p_customer_id;
  insert into public.v11210_loyalty_transactions(customer_id,kind,points,note,created_by)
  values(p_customer_id,'adjust',p_delta,trim(p_note),auth.uid());
  return next_points;
end $$;
grant execute on function public.v11210_adjust_points(uuid,integer,text) to authenticated;

create or replace function public.v11210_award_paid_order_points()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.v11210_loyalty_settings%rowtype;
  c public.v100_customers%rowtype;
  earned integer;
  inserted_id uuid;
begin
  if new.payment_status<>'paid' then return new; end if;
  if tg_op='UPDATE' and old.payment_status='paid' then return new; end if;

  select * into s from public.v11210_loyalty_settings where id=1;
  if s.id is null or not s.enabled then return new; end if;

  select * into c from public.v100_customers where id=new.customer_id for update;
  if c.id is null or not c.is_member then return new; end if;

  earned:=floor(new.total/s.spend_per_point);
  if earned<=0 then return new; end if;

  insert into public.v11210_loyalty_transactions(customer_id,order_id,kind,points,amount_reference,note,created_by)
  values(c.id,new.id,'earn',earned,new.total,'Poin dari order '||new.order_no,auth.uid())
  on conflict do nothing returning id into inserted_id;

  if inserted_id is not null then
    update public.v100_customers set points_balance=points_balance+earned,updated_at=now() where id=c.id;
  end if;
  return new;
end $$;

drop trigger if exists v11210_award_paid_order_points_trg on public.v100_orders;
create trigger v11210_award_paid_order_points_trg
after insert or update of payment_status on public.v100_orders
for each row execute function public.v11210_award_paid_order_points();

notify pgrst,'reload schema';
