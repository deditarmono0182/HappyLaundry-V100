export type InventoryUnit='ml'|'liter'|'gram'|'kg'|'pcs'|'roll'|'box'|'pack'|'item'

export interface InventoryItem{
  id:string
  name:string
  category:string
  unit:InventoryUnit
  stock:number
  minimum_stock:number
  cost_price:number
  supplier_id:string|null
  supplier_name?:string|null
  is_active:boolean
  notes:string|null
  created_at:string
  updated_at:string
}

export interface InventoryMovement{
  id:string
  item_id:string
  item_name?:string
  movement_type:'in'|'out'|'adjustment'
  quantity:number
  unit_cost:number
  total_cost:number
  reference:string|null
  supplier_id:string|null
  supplier_name?:string|null
  notes:string|null
  created_at:string
}

export interface Supplier{
  id:string
  name:string
  phone:string|null
  address:string|null
  contact_person:string|null
  notes:string|null
  is_active:boolean
  created_at:string
}
