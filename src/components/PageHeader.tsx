import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

function fallbackPath(pathname:string){
  if(pathname.startsWith('/settings/'))return '/settings'
  if(pathname.startsWith('/finance/'))return '/finance'
  if(pathname==='/payroll')return '/'
  if(pathname==='/attendance')return '/'
  if(pathname==='/orders')return '/'
  if(pathname==='/cashier')return '/'
  if(pathname==='/qr-scan')return '/'
  if(pathname==='/production')return '/'
  if(pathname==='/customers')return '/'
  if(pathname==='/services')return '/'
  if(pathname==='/inventory')return '/'
  if(pathname==='/suppliers')return '/'
  if(pathname==='/payments')return '/'
  if(pathname==='/cash')return '/'
  if(pathname==='/finance')return '/'
  if(pathname==='/receivables')return '/'
  if(pathname==='/reports')return '/'
  if(pathname==='/backup')return '/'
  if(pathname==='/settings')return '/'
  return '/'
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  hideBack=false
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
  hideBack?: boolean
}) {
  const navigate=useNavigate()
  const location=useLocation()
  const showBack=!hideBack&&location.pathname!=='/'

  const goBack=()=>{
    const historyIndex=Number(window.history.state?.idx??0)
    if(historyIndex>0){
      navigate(-1)
      return
    }
    navigate(fallbackPath(location.pathname))
  }

  return (
    <div className={`page-heading ${showBack?'page-heading-with-back':''}`}>
      <div className="page-heading-main">
        {showBack&&
          <button
            type="button"
            className="page-back-button"
            onClick={goBack}
            aria-label="Kembali ke halaman sebelumnya"
            title="Kembali"
          >
            <ArrowLeft size={19}/>
            <span>Kembali</span>
          </button>}
        <div className="page-heading-copy">
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {action && <div className="page-heading-action">{action}</div>}
    </div>
  )
}
