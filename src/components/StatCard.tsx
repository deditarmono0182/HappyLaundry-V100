import type{LucideIcon}from'lucide-react'
export function StatCard({label,value,caption,icon:Icon}:{label:string;value:string;caption:string;icon:LucideIcon}){
  const isMoney=/^\s*Rp/i.test(value)
  return <article className="stat-card"><div className="stat-icon"><Icon size={24}/></div><div><span>{label}</span><strong className={isMoney?'stat-money-value':undefined}>{value}</strong><small>{caption}</small></div></article>
}
