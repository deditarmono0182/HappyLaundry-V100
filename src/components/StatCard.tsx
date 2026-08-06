import type{LucideIcon}from'lucide-react'
export function StatCard({label,value,caption,icon:Icon}:{label:string;value:string;caption:string;icon:LucideIcon}){return <article className="stat-card"><div className="stat-icon"><Icon size={24}/></div><div><span>{label}</span><strong>{value}</strong><small>{caption}</small></div></article>}
