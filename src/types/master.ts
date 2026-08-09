export interface Customer {
  id: string
  store_id: string | null
  name: string
  phone: string
  address: string | null
  notes: string | null
  is_member?: boolean
  member_code?: string | null
  points_balance?: number
  member_since?: string | null
  created_at: string
}

export interface Service {
  id: string
  store_id: string | null
  name: string
  category: string
  unit: 'kg' | 'pcs' | 'item' | 'cm'
  price: number
  duration_hours: number
  is_active: boolean
  created_at: string
}
