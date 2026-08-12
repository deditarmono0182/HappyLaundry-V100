import{StrictMode}from'react'
import{createRoot}from'react-dom/client'
import{BrowserRouter}from'react-router-dom'
import App from'./App'
import{AuthProvider}from'./lib/auth'
import'./styles/global.css'

const savedDensity=localStorage.getItem('happylaundry-density')||'compact'
document.documentElement.dataset.density=savedDensity

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter></StrictMode>
)

if('serviceWorker' in navigator&&import.meta.env.PROD){
  window.addEventListener('load',async()=>{
    try{
      const registration=await navigator.serviceWorker.register('/sw.js?v=113.0.40',{updateViaCache:'none'})
      await registration.update()
    }catch(error){
      console.warn('Service worker gagal:',error)
    }
  })
}
