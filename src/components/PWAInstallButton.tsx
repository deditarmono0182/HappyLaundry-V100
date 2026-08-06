import { Download, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PWAInstallButton() {
  const [promptEvent,setPromptEvent]=useState<BeforeInstallPromptEvent|null>(null)
  const [standalone,setStandalone]=useState(false)
  const [updateReady,setUpdateReady]=useState(false)

  useEffect(()=>{
    const media=window.matchMedia('(display-mode: standalone)')
    setStandalone(media.matches)

    const beforeInstall=(event:Event)=>{
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt',beforeInstall)

    if('serviceWorker' in navigator){
      navigator.serviceWorker.ready.then(registration=>{
        registration.addEventListener('updatefound',()=>{
          const worker=registration.installing
          worker?.addEventListener('statechange',()=>{
            if(worker.state==='installed'&&navigator.serviceWorker.controller)setUpdateReady(true)
          })
        })
      })
    }

    return()=>window.removeEventListener('beforeinstallprompt',beforeInstall)
  },[])

  const install=async()=>{
    if(!promptEvent)return
    await promptEvent.prompt()
    const choice=await promptEvent.userChoice
    if(choice.outcome==='accepted')setPromptEvent(null)
  }

  if(updateReady)return <button className="pwa-button" onClick={()=>window.location.reload()} title="Versi baru tersedia"><RefreshCw size={15}/>Perbarui</button>
  if(standalone||!promptEvent)return null
  return <button className="pwa-button" onClick={()=>void install()}><Download size={15}/>Pasang Aplikasi</button>
}
