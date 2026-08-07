import { useCallback, useEffect, useState } from 'react'
import { Activity, LogIn, Search } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'

interface LoginRow{
  id:string
  login_id:string
  full_name:string|null
  device:string|null
  success:boolean
  reason:string|null
  created_at:string
}

interface AuditRow{
  id:string
  login_id:string|null
  full_name:string|null
  action:string
  entity_type:string|null
  entity_id:string|null
  details:string|null
  created_at:string
}

export function UserAuditPage(){
  const[tab,setTab]=useState<'login'|'activity'>('login')
  const[logins,setLogins]=useState<LoginRow[]>([])
  const[activity,setActivity]=useState<AuditRow[]>([])
  const[query,setQuery]=useState('')
  const[message,setMessage]=useState('')

  const load=useCallback(async()=>{
    setMessage('')
    const[l,a]=await Promise.all([
      supabase.from('v109_login_history').select('*').order('created_at',{ascending:false}).limit(300),
      supabase.from('v109_audit_log').select('*').order('created_at',{ascending:false}).limit(300)
    ])
    if(l.error||a.error)setMessage((l.error||a.error)?.message||'Gagal memuat audit')
    else{
      setLogins((l.data as LoginRow[])||[])
      setActivity((a.data as AuditRow[])||[])
    }
  },[])

  useEffect(()=>{void load()},[load])

  const key=query.toLowerCase().trim()
  const filteredLogins=key?logins.filter(r=>`${r.login_id} ${r.full_name||''} ${r.device||''} ${r.reason||''}`.toLowerCase().includes(key)):logins
  const filteredActivity=key?activity.filter(r=>`${r.login_id||''} ${r.full_name||''} ${r.action} ${r.entity_type||''} ${r.details||''}`.toLowerCase().includes(key)):activity

  return <>
    <PageHeader
      eyebrow="SECURITY & AUDIT"
      title="Riwayat Karyawan"
      description="Pantau login dan aktivitas penting akun internal HappyLaundry."
    />

    <section className="panel audit-tabs">
      <button className={tab==='login'?'active':''} onClick={()=>setTab('login')}><LogIn size={16}/>Riwayat Login</button>
      <button className={tab==='activity'?'active':''} onClick={()=>setTab('activity')}><Activity size={16}/>Audit Aktivitas</button>
    </section>

    <section className="panel data-panel">
      <div className="toolbar">
        <label className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari ID, nama, perangkat, atau aktivitas"/></label>
      </div>
      {message&&<div className="error-box inline-message">{message}</div>}

      {tab==='login'?<div className="table-wrap"><table>
        <thead><tr><th>Waktu</th><th>ID Akun</th><th>Nama</th><th>Perangkat</th><th>Status</th><th>Keterangan</th></tr></thead>
        <tbody>{filteredLogins.map(r=><tr key={r.id}>
          <td>{new Date(r.created_at).toLocaleString('id-ID')}</td>
          <td><b>{r.login_id}</b></td>
          <td>{r.full_name||'-'}</td>
          <td>{r.device||'-'}</td>
          <td><span className={`badge ${r.success?'success-badge':'danger-badge'}`}>{r.success?'Berhasil':'Gagal'}</span></td>
          <td>{r.reason||'-'}</td>
        </tr>)}</tbody>
      </table></div>:<div className="table-wrap"><table>
        <thead><tr><th>Waktu</th><th>ID Akun</th><th>Nama</th><th>Aktivitas</th><th>Objek</th><th>Detail</th></tr></thead>
        <tbody>{filteredActivity.map(r=><tr key={r.id}>
          <td>{new Date(r.created_at).toLocaleString('id-ID')}</td>
          <td><b>{r.login_id||'-'}</b></td>
          <td>{r.full_name||'-'}</td>
          <td><b>{r.action}</b></td>
          <td>{r.entity_type||'-'} {r.entity_id?`• ${r.entity_id}`:''}</td>
          <td>{r.details||'-'}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>
}
