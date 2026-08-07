import type { EmployeePermissions, UserProfile } from '../types/auth'

export type PermissionKey=keyof EmployeePermissions

const legacyRolePermissions:Record<string,PermissionKey[]>={
  cashier:['dashboard','cashier','orders','qr_center','customers','services'],
  staff:['dashboard','production'],
  production:['qr_center','production']
}

export function canAccess(profile:UserProfile|null|undefined,key:PermissionKey){
  if(!profile)return false
  if(profile.role==='owner')return true
  if(profile.role==='employee'){
    if(profile.employee_active===false)return false
    return Boolean(profile.permissions?.[key])
  }
  return legacyRolePermissions[profile.role]?.includes(key)??false
}
