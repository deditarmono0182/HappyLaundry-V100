import type { OrderStatus, PaymentStatus } from '../types/order'

export const statusLabels: Record<OrderStatus, string> = {
  received: 'Diterima',
  washing: 'Dicuci',
  drying: 'Dikeringkan',
  ironing: 'Disetrika',
  packing: 'Packing',
  ready: 'Siap Diambil',
  completed: 'Selesai',
  cancelled: 'Dibatalkan'
}

export const paymentLabels: Record<PaymentStatus, string> = {
  unpaid: 'Belum Bayar',
  partial: 'DP / Sebagian',
  paid: 'Lunas'
}

export function paymentStatus(total: number, paid: number): PaymentStatus {
  if (paid <= 0) return 'unpaid'
  if (paid >= total) return 'paid'
  return 'partial'
}
