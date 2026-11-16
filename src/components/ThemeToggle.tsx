import{useEffect,useState}from'react'
import{Moon,Monitor,Sun}from'lucide-react'
import{applyTheme,getThemeMode,setThemeMode,type ThemeMode}from'../lib/theme'

const NEXT:Record<ThemeMode,ThemeMode>={light:'dark',dark:'auto',auto:'light'}
const LABEL:Record<ThemeMode,string>={light:'Tema Terang',dark:'Tema Gelap',auto:'Tema Otomatis (ikut HP)'}

export function ThemeToggle(){
  const[mode,setMode]=useState<ThemeMode>(getThemeMode())
  useEffect(()=>{
    if(mode!=='auto')return
    const mq=window.matchMedia('(prefers-color-scheme: dark)')
    const onChange=()=>applyTheme('auto')
    mq.addEventListener('change',onChange)
    return()=>mq.removeEventListener('change',onChange)
  },[mode])
  const change=()=>{const next=NEXT[mode];setThemeMode(next);setMode(next)}
  const Icon=mode==='dark'?Moon:mode==='auto'?Monitor:Sun
  return <button type="button" className="icon-button theme-toggle" onClick={change} aria-label={LABEL[mode]+' - klik untuk ganti'} title={LABEL[mode]+' - klik untuk ganti'}><Icon size={19}/></button>
}
