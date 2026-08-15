import React from 'react'

type Props={children?:React.ReactNode}
type State={hasError:boolean;message:string}
export class AppErrorBoundary extends React.Component<Props,State>{
  state:State={hasError:false,message:''}
  static getDerivedStateFromError(error:unknown):State{
    return{hasError:true,message:error instanceof Error?error.message:'Aplikasi mengalami kendala.'}
  }
  componentDidCatch(error:unknown,info:unknown){console.error('HappyLaundry UI error',error,info)}
  render(){
    if(this.state.hasError)return <div className="app-fallback-error"><div><h2>HappyLaundry belum dapat menampilkan halaman</h2><p>{this.state.message}</p><button onClick={()=>window.location.reload()}>Coba Lagi</button><small>Data tidak dihapus. Halaman hanya dimuat ulang.</small></div></div>
    return this.props.children
  }
}
