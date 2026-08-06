export type OrderStatus =
  | 'received'
  | 'washing'
  | 'drying'
  | 'ironing'
  | 'packing'
  | 'ready'
  | 'completed'
  | 'cancelled'

export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

export interface OrderRow {
  id: string
  order_no: string
  customer_id: string
  customer_name: string
  customer_phone: string
  status: OrderStatus
  payment_status: PaymentStatus
  subtotal: number
  discount: number
  total: number
  paid_amount: number
  notes: string | null
  due_at: string | null
  created_at: string
}

export interface OrderItemDraft {
  key: string
  service_id: string
  service_name: string
  unit: string
  price: number
  quantity: number
  subtotal: number
}
