-- HappyLaundry Enterprise V113.0.29
-- Lunas & Ambil Barang boleh dilakukan pada status produksi apa pun.
-- Cocok untuk alur: barang dikirim ke pelanggan dahulu, lalu pelanggan transfer.

create or replace function public.v11326_confirm_payment_proof(
  p_proof_id uuid,
  p_complete_order boolean default false
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.v1129_payment_proofs%rowtype;
  o public.v100_orders%rowtype;
  pay_amount numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Login diperlukan.'; end if;

  select * into p
  from public.v1129_payment_proofs
  where id=p_proof_id
  for update;

  if p.id is null then raise exception 'Bukti pembayaran tidak ditemukan.'; end if;
  if p.status<>'pending' then raise exception 'Bukti ini sudah diproses.'; end if;

  select * into o
  from public.v100_orders
  where id=p.order_id
  for update;

  if o.id is null then raise exception 'Order tidak ditemukan.'; end if;

  pay_amount:=least(p.amount,greatest(0,o.total-o.paid_amount));

  if pay_amount>0 then
    perform public.v100_add_payment(
      p_order_id => p.order_id,
      p_amount => pay_amount,
      p_method => p.method,
      p_notes => case
        when coalesce(p_complete_order,false)
          then 'Konfirmasi pembayaran online + barang sudah diterima/diambil pelanggan'
        else 'Konfirmasi pembayaran online. Status produksi tidak diubah.'
      end
    );
  end if;

  if coalesce(p_complete_order,false) then
    update public.v100_orders
    set status='completed',updated_at=now()
    where id=o.id;
  end if;

  update public.v1129_payment_proofs
  set status='confirmed',
      reviewed_at=now(),
      reviewed_by=auth.uid(),
      review_note=case
        when coalesce(p_complete_order,false)
          then 'Dikonfirmasi lunas + barang diterima/diambil / selesai'
        else 'Dikonfirmasi lunas; status produksi dipertahankan'
      end
  where id=p.id;

  insert into public.v109_audit_log(action,entity_type,entity_id,details)
  values(
    case when coalesce(p_complete_order,false)
      then 'ONLINE_PAYMENT_CONFIRMED_PICKUP'
      else 'ONLINE_PAYMENT_CONFIRMED'
    end,
    'payment_proof',
    p.id::text,
    case when coalesce(p_complete_order,false)
      then 'Pembayaran online dikonfirmasi lunas dan order ditandai selesai karena barang sudah diterima/diambil pelanggan.'
      else 'Pembayaran online dikonfirmasi lunas tanpa mengubah status produksi laundry.'
    end
  );

  return true;
end;
$$;

grant execute on function public.v11326_confirm_payment_proof(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
