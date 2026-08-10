-- HappyLaundry Enterprise V113.0.27
-- Re-assert bucket payment-proofs agar upload bukti dari Tracking publik tetap diizinkan.
-- Aman dijalankan ulang setelah SQL 040.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict(id) do update set
  public=false,
  file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists payment_proofs_public_insert on storage.objects;
create policy payment_proofs_public_insert
on storage.objects
for insert to anon,authenticated
with check(bucket_id='payment-proofs');

drop policy if exists payment_proofs_authenticated_read on storage.objects;
create policy payment_proofs_authenticated_read
on storage.objects
for select to authenticated
using(bucket_id='payment-proofs');

notify pgrst,'reload schema';
