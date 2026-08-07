export type UserRole='owner'|'cashier'|'staff'|'employee'

export interface EmployeePermissions{
  dashboard:boolean
  cashier:boolean
  orders:boolean
  qr_center:boolean
  production:boolean
  customers:boolean
  services:boolean
  payments:boolean
  receivables:boolean
  finance:boolean
  cash:boolean
  reports:boolean
  backup:boolean
  settings:boolean
}

export interface UserProfile{
  id:string
  full_name:string
  role:UserRole
  store_id:string|null
  login_id?:string|null
  permissions?:EmployeePermissions|null
  employee_active?:boolean
}
