-- HappyLaundry Enterprise V113.0.5
-- Upload Nota / Bukti Pengeluaran
-- Jalankan sekali setelah SQL 035.

alter table public.v106_expenses
  add column if not exists proof_path text null,
  add column if not exists proof_name text null;

-- Recreate view agar kolom bukti ikut terbaca aplikasi.
create or replace view public.v106_expenses_view
with (security_invoker=true)
as
select
  e.id,e.expense_date,e.category_id,e.category_name,e.amount,
  e.payment_method,e.description,e.reference,e.created_at,
  e.proof_path,e.proof_name,
  c.group_name
from public.v106_expenses e
left join public.v106_expense_categories c on c.id=e.category_id;

grant select on public.v106_expenses_view to authenticated;

-- Bucket PRIVATE: bukti pengeluaran bukan file publik.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'expense-proofs',
  'expense-proofs',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict(id)
do update set
  public=false,
  file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists expense_proofs_finance_insert on storage.objects;
create policy expense_proofs_finance_insert
on storage.objects
for insert to authenticated
with check(
  bucket_id='expense-proofs'
  and public.v11304_can_manage_expenses()
);

drop policy if exists expense_proofs_finance_select on storage.objects;
create policy expense_proofs_finance_select
on storage.objects
for select to authenticated
using(
  bucket_id='expense-proofs'
  and public.v11304_can_manage_expenses()
);

drop policy if exists expense_proofs_finance_delete on storage.objects;
create policy expense_proofs_finance_delete
on storage.objects
for delete to authenticated
using(
  bucket_id='expense-proofs'
  and public.v11304_can_manage_expenses()
);

notify pgrst,'reload schema';
