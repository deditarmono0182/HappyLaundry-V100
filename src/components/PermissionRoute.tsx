import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { canAccess, type PermissionKey } from '../lib/permissions'

export function PermissionRoute({permission,children}:{permission:PermissionKey;children:React.ReactNode}){
  const{profile}=useAuth()
  if(!canAccess(profile,permission))return <Navigate to="/" replace/>
  return <>{children}</>
}
