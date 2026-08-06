export type UserRole='owner'|'cashier'|'staff'
export interface UserProfile{id:string;full_name:string;role:UserRole;store_id:string|null}
