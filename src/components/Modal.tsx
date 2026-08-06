import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
        <header>
          <h3>{title}</h3>
          <button className="icon-button" onClick={onClose} aria-label="Tutup"><X size={20} /></button>
        </header>
        {children}
      </section>
    </div>
  )
}
