-- HappyLaundry Enterprise V110.8
-- Pengaturan Print Nota
-- Jalankan setelah SQL V110.7.5.

create table if not exists public.v110_receipt_print_settings(
  id integer primary key default 1 check(id=1),
  paper_size text not null default '58' check(paper_size in('58','80','a4')),
  template text not null default 'professional' check(template in('minimal','professional','premium')),
  font_size integer not null default 11 check(font_size between 8 and 18),
  copies integer not null default 1 check(copies between 1 and 3),
  auto_print boolean not null default false,
  show_logo boolean not null default true,
  show_qr boolean not null default true,
  show_barcode boolean not null default true,
  show_customer_phone boolean not null default true,
  show_due_at boolean not null default true,
  show_payment_method boolean not null default true,
  show_status boolean not null default true,
  show_item_price boolean not null default true,
  show_discount boolean not null default true,
  show_paid boolean not null default true,
  show_balance boolean not null default true,
  show_maps boolean not null default false,
  show_cut_line boolean not null default true,
  header_note text not null default '',
  footer_note text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.v110_receipt_print_settings(id)
values(1)
on conflict(id) do nothing;

alter table public.v110_receipt_print_settings enable row level security;

drop policy if exists v110_receipt_print_read on public.v110_receipt_print_settings;
create policy v110_receipt_print_read
on public.v110_receipt_print_settings
for select to authenticated
using(true);

drop policy if exists v110_receipt_print_owner_insert on public.v110_receipt_print_settings;
create policy v110_receipt_print_owner_insert
on public.v110_receipt_print_settings
for insert to authenticated
with check(
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner')
);

drop policy if exists v110_receipt_print_owner_update on public.v110_receipt_print_settings;
create policy v110_receipt_print_owner_update
on public.v110_receipt_print_settings
for update to authenticated
using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'))
with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner'));

grant select,insert,update on public.v110_receipt_print_settings to authenticated;

notify pgrst,'reload schema';
