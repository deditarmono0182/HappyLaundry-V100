export type ThemeMode='light'|'dark'|'auto'
const KEY='happylaundry-theme'
export function getThemeMode():ThemeMode{
  try{const v=localStorage.getItem(KEY);if(v==='light'||v==='dark'||v==='auto')return v}catch{/* abaikan */}
  return 'light'
}
export function resolveTheme(mode:ThemeMode):'light'|'dark'{
  if(mode==='auto')return window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'
  return mode
}
export function applyTheme(mode:ThemeMode){
  const t=resolveTheme(mode)
  document.documentElement.dataset.theme=t
  document.documentElement.style.colorScheme=t
  const meta=document.querySelector('meta[name="theme-color"]')
  if(meta)meta.setAttribute('content',t==='dark'?'#0f1722':'#1E88E5')
}
export function setThemeMode(mode:ThemeMode){
  try{localStorage.setItem(KEY,mode)}catch{/* abaikan */}
  applyTheme(mode)
}
