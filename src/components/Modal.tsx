import type { ReactNode } from 'react'
import { X } from 'lucide-react'

type ModalProps = {
  title: string
  children: ReactNode
  onClose: () => void
  className?: string
  bodyClassName?: string
}

export function Modal({ title, children, onClose, className = '', bodyClassName = '' }: ModalProps) {
  const cardClassName = ['modal-card', className].filter(Boolean).join(' ')

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className={cardClassName} role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
        <header>
          <h3>{title}</h3>
          <button className="icon-button" onClick={onClose} aria-label="Tutup"><X size={20} /></button>
        </header>
        {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
      </section>
    </div>
  )
}
