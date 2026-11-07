import {useState} from 'react'
import {Volume2,VolumeX} from 'lucide-react'

let audio:AudioContext|null=null
let enabled=false
// Browsers require a user gesture before audio can start. Never block a request on audio.
export function playRequestSound(){
 if(!enabled||!audio||audio.state!=='running'||document.visibilityState==='hidden')return
 try{
  const now=audio.currentTime
  for(const [offset,hz] of [[0,660],[.18,880]]){
   const oscillator=audio.createOscillator(),gain=audio.createGain()
   oscillator.frequency.value=hz;gain.gain.setValueAtTime(0,now+offset)
   gain.gain.linearRampToValueAtTime(.12,now+offset+.02)
   gain.gain.exponentialRampToValueAtTime(.001,now+offset+.16)
   oscillator.connect(gain);gain.connect(audio.destination)
   oscillator.start(now+offset);oscillator.stop(now+offset+.18)
   oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()}
  }
 }catch{/* Audio availability must not affect the application. */}
}
export function RequestSoundButton(){
 const [on,setOn]=useState(enabled),[error,setError]=useState('')
 const toggle=async()=>{
  if(on){enabled=false;setOn(false);return}
  try{
   audio??=new AudioContext();await audio.resume()
   if(audio.state!=='running')throw new Error('audio')
   enabled=true;setOn(true);setError('');playRequestSound()
  }catch{setError('Bunyi belum tersedia. Tekan lagi untuk mencoba.')}
 }
 return <button type="button" className="cash-notice-bell" aria-pressed={on} aria-label={on?'Matikan bunyi pemberitahuan':'Aktifkan bunyi pemberitahuan'} title={error||(on?'Bunyi aktif selama aplikasi terbuka':'Aktifkan bunyi pemberitahuan')} onClick={()=>void toggle()}>{on?<Volume2 size={20}/>:<VolumeX size={20}/>}</button>
}
