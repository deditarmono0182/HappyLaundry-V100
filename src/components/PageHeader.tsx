import type { ReactNode } from 'react'

export function PageHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action && <div className="page-heading-action">{action}</div>}
    </div>
  )
}
