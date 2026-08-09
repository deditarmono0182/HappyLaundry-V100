-- HappyLaundry Enterprise V113.0.4
-- Hak Akses Karyawan: Input Pengeluaran, Bagi Hasil Owner Only
-- Jalankan sekali setelah SQL versi sebelumnya.

-- Helper: Owner atau karyawan aktif dengan permission finance=true.
create or replace function public.v11304_can_manage_expenses()
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
    or
    exists(
      select 1 from public.v109_users u
      where u.auth_uid=auth.uid()
        and u.is_active=true
        and u.finance=true
    );
$$;

grant execute on function public.v11304_can_manage_expenses() to authenticated;

-- Ganti policy lama yang terlalu luas pada transaksi pengeluaran.
drop policy if exists v106_expenses_authenticated_all on public.v106_expenses;
drop policy if exists v11304_expenses_select on public.v106_expenses;
drop policy if exists v11304_expenses_insert on public.v106_expenses;
drop policy if exists v11304_expenses_update on public.v106_expenses;
drop policy if exists v11304_expenses_delete on public.v106_expenses;

create policy v11304_expenses_select
on public.v106_expenses
for select to authenticated
using(public.v11304_can_manage_expenses());

create policy v11304_expenses_insert
on public.v106_expenses
for insert to authenticated
with check(public.v11304_can_manage_expenses());

create policy v11304_expenses_update
on public.v106_expenses
for update to authenticated
using(public.v11304_can_manage_expenses())
with check(public.v11304_can_manage_expenses());

create policy v11304_expenses_delete
on public.v106_expenses
for delete to authenticated
using(public.v11304_can_manage_expenses());

-- Kategori pengeluaran boleh dibaca karyawan yang punya finance,
-- tetapi perubahan kategori hanya Owner.
drop policy if exists v106_expense_categories_authenticated_all on public.v106_expense_categories;
drop policy if exists v11304_expense_categories_select on public.v106_expense_categories;
drop policy if exists v11304_expense_categories_owner_insert on public.v106_expense_categories;
drop policy if exists v11304_expense_categories_owner_update on public.v106_expense_categories;
drop policy if exists v11304_expense_categories_owner_delete on public.v106_expense_categories;

create policy v11304_expense_categories_select
on public.v106_expense_categories
for select to authenticated
using(public.v11304_can_manage_expenses());

create policy v11304_expense_categories_owner_insert
on public.v106_expense_categories
for insert to authenticated
with check(
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner')
);

create policy v11304_expense_categories_owner_update
on public.v106_expense_categories
for update to authenticated
using(
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner')
)
with check(
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner')
);

create policy v11304_expense_categories_owner_delete
on public.v106_expense_categories
for delete to authenticated
using(
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner')
);

-- Tegaskan kembali: konfigurasi Bagi Hasil hanya boleh ditulis Owner.
-- SELECT lama boleh tetap untuk Owner/app, tetapi UI karyawan tidak memuat data ini.
drop policy if exists v110_revenue_share_owner_insert on public.v110_revenue_share_settings;
create policy v110_revenue_share_owner_insert
on public.v110_revenue_share_settings
for insert to authenticated
with check(
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner')
);

drop policy if exists v110_revenue_share_owner_update on public.v110_revenue_share_settings;
create policy v110_revenue_share_owner_update
on public.v110_revenue_share_settings
for update to authenticated
using(
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner')
)
with check(
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner')
);

drop policy if exists v110_revenue_share_owner_delete on public.v110_revenue_share_settings;
create policy v110_revenue_share_owner_delete
on public.v110_revenue_share_settings
for delete to authenticated
using(
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner')
);

notify pgrst,'reload schema';
