import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Phone, Mail, TrendingUp, Download, ChevronDown, ChevronRight, Clock,
  Zap, BarChart3, Users, Target, Search, X, Copy, Check, Loader2,
  FileSpreadsheet, ArrowUpDown, Sparkles, PhoneCall, AlertCircle,
  LogOut, Trash2, FolderOpen, Plus, ArrowLeft,
} from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { readFile, processLeads } from './lib/parser'
import { TIERS } from './lib/scoring'
import { exportRankedXLSX, exportMojoCSV, exportEmailCSV, computeStats } from './lib/exporter'
import { generateForLead, batchGenerateEmails } from './lib/ai'
import {
  supabase, signIn, signOut, getSession, onAuthChange,
  createList, insertLeads, loadLists, loadLeads, deleteList,
} from './lib/supabase'

// ── Shared ──

function Stat({ icon: I, label, value, sub, accent }) {
  return <div className="stat-card"><div className="stat-header"><I size={14} color={accent||'#9ca3af'}/><span className="stat-label">{label}</span></div><div className="stat-value">{value}</div>{sub&&<div className="stat-sub">{sub}</div>}</div>
}
function CopyBtn({ text }) {
  const [ok,set]=useState(false)
  return <button onClick={()=>{navigator.clipboard.writeText(text);set(true);setTimeout(()=>set(false),1500)}} className="copy-btn">{ok?<Check size={12} color="#16a34a"/>:<Copy size={12}/>}{ok?'Copied':'Copy'}</button>
}
function TierBadge({ tier }) {
  const t=TIERS[tier]; if(!t) return null
  return <span className="tier-badge tier-badge--sm" style={{background:t.bg,color:t.color}}><span style={{width:6,height:6,borderRadius:'50%',background:t.color,display:'inline-block'}}/>{t.label}</span>
}
function DropZone({ label, desc, file, onFile, accept }) {
  const ref=useRef(null);const [drag,setDrag]=useState(false)
  return (
    <div className={`drop-zone ${file?'drop-zone--done':''} ${drag?'drop-zone--active':''}`}
      onClick={()=>ref.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
      onDrop={e=>{e.preventDefault();setDrag(false);e.dataTransfer.files[0]&&onFile(e.dataTransfer.files[0])}}>
      <input ref={ref} type="file" accept={accept} style={{display:'none'}} onChange={e=>e.target.files[0]&&onFile(e.target.files[0])}/>
      <div className={`drop-zone__icon ${file?'drop-zone__icon--done':''}`}>{file?<Check size={22} color="#16a34a"/>:<FileSpreadsheet size={22} color="#111827"/>}</div>
      <div className="drop-zone__label">{label}</div><div className="drop-zone__desc">{file?file.name:desc}</div>
    </div>
  )
}

// ── Login ──

function Login({ onAuth }) {
  const [email,setEmail]=useState('');const [pass,setPass]=useState('');const [err,setErr]=useState(null);const [loading,setLoading]=useState(false)
  const submit=async e=>{
    e.preventDefault();setErr(null);setLoading(true)
    const {data,error}=await signIn(email,pass)
    setLoading(false)
    if(error) return setErr(error)
    if(data?.session) onAuth(data.session)
  }
  return (
    <div className="auth-wrap"><form className="auth-card" onSubmit={submit}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:24}}><Target size={20}/><span style={{fontWeight:700,fontSize:16}}>Lead Intel</span></div>
      <h1>Sign in</h1><p>Use the credentials provided by your coach.</p>
      {err&&<div className="auth-error">{err}</div>}
      <label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" required/>
      <label>Password</label><input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Your password" required/>
      <button type="submit" className="auth-btn" disabled={loading}>{loading?<Loader2 size={16} className="spinning"/>:null}Sign In</button>
    </form></div>
  )
}

// ── My Lists ──

function MyLists({ lists, loading, onSelect, onUpload, onDelete }) {
  const [confirm,setConfirm]=useState(null)
  return (
    <div style={{maxWidth:720,margin:'0 auto',padding:'48px 24px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div><h2 style={{fontSize:22,fontWeight:700,letterSpacing:-0.4}}>My Lists</h2><p style={{fontSize:14,color:'#9ca3af'}}>Upload a new export or open a previous one.</p></div>
        <button onClick={onUpload} style={{background:'#111827',border:'none',borderRadius:10,padding:'8px 16px',color:'#fff',display:'flex',alignItems:'center',gap:6,fontSize:13,fontWeight:600,cursor:'pointer'}}><Plus size={15}/>Upload New List</button>
      </div>
      {loading&&<div style={{textAlign:'center',padding:40,color:'#9ca3af'}}><Loader2 size={20} className="spinning"/></div>}
      {!loading&&lists.length===0&&(
        <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:14,padding:'48px 24px',textAlign:'center'}}>
          <FolderOpen size={32} color="#d1d5db" style={{marginBottom:12}}/>
          <div style={{fontSize:15,fontWeight:600,marginBottom:4}}>No lists yet</div>
          <div style={{fontSize:13,color:'#9ca3af',marginBottom:16}}>Upload your first Mojo export to get started.</div>
          <button onClick={onUpload} style={{background:'#111827',border:'none',borderRadius:8,padding:'8px 16px',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>Upload List</button>
        </div>
      )}
      {lists.map(l=>(
        <div key={l.id} onClick={()=>onSelect(l.id)} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:12,padding:'16px 20px',marginBottom:10,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',transition:'background 0.1s',boxShadow:'0 1px 2px rgba(0,0,0,0.03)'}}
          onMouseEnter={e=>e.currentTarget.style.background='#f9fafb'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
          <div>
            <div style={{fontSize:14,fontWeight:600,marginBottom:3}}>{l.name}</div>
            <div style={{fontSize:12,color:'#9ca3af'}}>{l.total_leads} leads &middot; {l.callable_leads} with phone &middot; {l.with_email||0} with email &middot; Avg score {l.avg_score}</div>
            <div style={{fontSize:11,color:'#d1d5db',marginTop:2}}>{new Date(l.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</div>
          </div>
          <button onClick={e=>{e.stopPropagation();setConfirm(confirm===l.id?null:l.id)}} style={{background:confirm===l.id?'#fef2f2':'#f9fafb',border:'1px solid #e5e7eb',borderRadius:8,padding:'6px 10px',color:confirm===l.id?'#dc2626':'#9ca3af',cursor:'pointer',display:'flex',alignItems:'center',gap:4,fontSize:12}}>
            <Trash2 size={13}/>{confirm===l.id?<span onClick={e=>{e.stopPropagation();onDelete(l.id);setConfirm(null)}}>Confirm</span>:'Delete'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Main ──

export default function App() {
  const [session,setSession]=useState(undefined)
  const [view,setView]=useState('lists') // lists, upload, leads
  const [file,setFile]=useState(null)
  const [leads,setLeads]=useState(null)
  const [activeListId,setActiveListId]=useState(null)
  const [lists,setLists]=useState([])
  const [listsLoading,setListsLoading]=useState(true)
  const [processing,setProcessing]=useState(false)
  const [saving,setSaving]=useState(false)
  const [loadingLeads,setLoadingLeads]=useState(false)
  const [error,setError]=useState(null)
  const [tab,setTab]=useState('dashboard')
  const [search,setSearch]=useState('')
  const [tierFilter,setTierFilter]=useState('all')
  const [expandedId,setExpandedId]=useState(null)
  const [sortField,setSortField]=useState('score')
  const [sortDir,setSortDir]=useState('desc')
  const [ai,setAi]=useState({})
  const [aiL,setAiL]=useState({})
  const [batchOn,setBatchOn]=useState(false)
  const [batchDone,setBatchDone]=useState(0)
  const [batchTotal,setBatchTotal]=useState(0)
  const [batchRes,setBatchRes]=useState(null)
  const cancelRef=useRef(false)

  // Auth check
  useEffect(()=>{
    if(!supabase){setSession(null);return}
    getSession().then(s=>setSession(s||null))
    return onAuthChange(s=>setSession(s||null))
  },[])

  // Load lists when session ready
  useEffect(()=>{
    if(!session||!supabase) return
    setListsLoading(true)
    loadLists().then(l=>{setLists(l);setListsLoading(false)})
  },[session])

  const refreshLists=async()=>{setLists(await loadLists())}

  // Load a saved list from DB
  const handleLoadList=async(listId)=>{
    setLoadingLeads(true);setError(null)
    try {
      const data=await loadLeads(listId)
      if(!data.length) throw new Error('This list has no leads. It may have been cleared.')
      setLeads(data);setActiveListId(listId);setView('leads');setTab('dashboard')
    } catch(e){setError(e.message)}
    setLoadingLeads(false)
  }

  // Process a new upload
  const handleProcess=useCallback(async()=>{
    if(!file) return; setProcessing(true);setError(null)
    try {
      const rows=await readFile(file)
      if(!rows.length) throw new Error('This file has no data rows. Make sure you exported leads from Mojo.')
      // Validate it looks like a Mojo export
      const first=rows[0]
      if(!first['Property Address']&&!first['Full Name']&&!first['Listing Status'])
        throw new Error('This file does not look like a Mojo export. Expected columns like Property Address, Full Name, and Listing Status.')
      const scored=processLeads(rows)
      setLeads(scored);setView('leads');setTab('dashboard')
      // Save to DB
      if(supabase&&session){
        setSaving(true)
        const listId=await createList(file.name.replace(/\.[^.]+$/,''))
        if(listId){
          const ok=await insertLeads(listId,scored)
          if(!ok) console.warn('Some leads may not have saved.')
          setActiveListId(listId);await refreshLists()
        }
        setSaving(false)
      }
    } catch(e){setError(e.message)}
    setProcessing(false)
  },[file,session])

  const handleDeleteList=async(id)=>{
    await deleteList(id);await refreshLists()
    if(activeListId===id){setLeads(null);setActiveListId(null);setView('lists')}
  }

  const goBack=()=>{setLeads(null);setActiveListId(null);setFile(null);setView('lists');setError(null);setAi({});setAiL({})}

  // Filtered leads
  const filtered=useMemo(()=>{
    if(!leads) return []
    let f=leads
    if(tierFilter!=='all') f=f.filter(l=>l.tier===tierFilter)
    if(search){const s=search.toLowerCase();f=f.filter(l=>l.address.toLowerCase().includes(s)||l.fullName.toLowerCase().includes(s)||l.city.toLowerCase().includes(s))}
    const d=sortDir==='desc'?-1:1
    return [...f].sort((a,b)=>{const av=a[sortField],bv=b[sortField];if(av==null)return 1;if(bv==null)return -1;return av>bv?d:av<bv?-d:0})
  },[leads,tierFilter,search,sortField,sortDir])

  const stats=useMemo(()=>computeStats(leads),[leads])
  const toggleSort=f=>{if(sortField===f)setSortDir(d=>d==='desc'?'asc':'desc');else{setSortField(f);setSortDir('desc')}}

  const genAI=async(id,type)=>{
    const k=`${id}-${type}`;if(ai[k])return;setAiL(p=>({...p,[k]:true}))
    try{const result=await generateForLead(leads.find(l=>l.id===id),type);setAi(p=>({...p,[k]:result}))}
    catch(e){setAi(p=>({...p,[k]:'Could not generate. '+e.message}))}
    setAiL(p=>({...p,[k]:false}))
  }

  const runBatch=async()=>{
    if(!leads)return;const n=leads.filter(l=>l.hasEmail).length;if(!n)return
    setBatchOn(true);setBatchDone(0);setBatchTotal(n);setBatchRes(null);cancelRef.current=false
    try{setBatchRes(await batchGenerateEmails(leads,(d,t)=>{setBatchDone(d);setBatchTotal(t)},cancelRef))}catch{setBatchRes([])}
    setBatchOn(false)
  }

  const pct=batchTotal>0?Math.round(batchDone/batchTotal*100):0
  const email=session?.user?.email

  // States
  if(session===undefined) return <div className="auth-wrap"><Loader2 size={24} className="spinning" style={{color:'#9ca3af'}}/></div>
  if(!session&&supabase) return <Login onAuth={setSession}/>

  // Upload screen
  if(view==='upload') return (
    <div>
      <nav className="topnav"><div className="topnav__left"><div className="topnav__brand"><Target size={18}/>Lead Intel</div></div>
        <div className="topnav__right">{email&&<button className="user-btn" onClick={()=>{signOut();setSession(null)}}><LogOut size={12}/>{email}</button>}</div></nav>
      <div className="upload-container">
        <button onClick={goBack} style={{background:'none',border:'none',display:'flex',alignItems:'center',gap:5,fontSize:13,color:'#9ca3af',marginBottom:20,cursor:'pointer'}}><ArrowLeft size={14}/>Back to my lists</button>
        <div className="upload-header">
          <h1>Upload your leads</h1>
          <p>Export your expired listings from Mojo as an .xlsx or .csv file, then drop it below.</p>
        </div>
        <DropZone label="Mojo Lead Export" desc="Drop your .xlsx or .csv file here" file={file} onFile={setFile} accept=".xlsx,.xls,.csv"/>
        {error&&<div className="error-banner"><AlertCircle size={14}/>{error}</div>}
        <button onClick={handleProcess} disabled={!file||processing} className={`process-btn ${file?'process-btn--ready':''}`}>
          {processing?<><Loader2 size={16} className="spinning"/>Scoring your leads...</>:<><Zap size={16}/>Score and Rank Leads</>}
        </button>
      </div>
    </div>
  )

  // My Lists screen
  if(view==='lists') return (
    <div>
      <nav className="topnav"><div className="topnav__left"><div className="topnav__brand"><Target size={18}/>Lead Intel</div></div>
        <div className="topnav__right">{email&&<button className="user-btn" onClick={()=>{signOut();setSession(null)}}><LogOut size={12}/>{email}</button>}</div></nav>
      {loadingLeads&&<div style={{textAlign:'center',padding:60,color:'#9ca3af'}}><Loader2 size={20} className="spinning" style={{marginBottom:8}}/><div style={{fontSize:13}}>Loading leads...</div></div>}
      {error&&<div style={{maxWidth:720,margin:'20px auto',padding:'0 24px'}}><div className="error-banner"><AlertCircle size={14}/>{error}</div></div>}
      {!loadingLeads&&<MyLists lists={lists} loading={listsLoading} onSelect={handleLoadList} onUpload={()=>{setView('upload');setFile(null);setError(null)}} onDelete={handleDeleteList}/>}
    </div>
  )

  // Active leads view
  const tierPie=Object.entries(TIERS).map(([k,v])=>({name:k,value:stats.tiers?.[k]||0,color:v.color}))
  const typesBar=Object.entries(stats.propTypes||{}).map(([k,v])=>({name:k,value:v}))

  return (
    <div>
      {/* Batch modal */}
      {(batchOn||batchRes)&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.3)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>{if(!batchOn)setBatchRes(null)}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:16,padding:28,width:440,maxWidth:'92vw',boxShadow:'0 16px 48px rgba(0,0,0,0.1)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <div style={{width:36,height:36,borderRadius:10,background:batchRes?'#ecfdf5':'#eff6ff',display:'flex',alignItems:'center',justifyContent:'center'}}>
                {batchOn?<Loader2 size={18} color="#2563eb" className="spinning"/>:<Check size={18} color="#16a34a"/>}</div>
              <div><div style={{fontSize:15,fontWeight:700}}>{batchOn?'Writing emails...':'Emails ready'}</div>
                <div style={{fontSize:13,color:'#9ca3af'}}>{batchOn?`${batchDone} of ${batchTotal}`:`${batchRes?.length} personalized emails`}</div></div>
            </div>
            <div style={{background:'#f0f1f3',borderRadius:5,height:5,marginBottom:16,overflow:'hidden'}}>
              <div style={{background:batchRes?'#16a34a':'#2563eb',height:'100%',borderRadius:5,width:`${pct}%`,transition:'width 0.3s'}}/></div>
            {batchOn&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:13,color:'#9ca3af'}}>{pct}%</span><button onClick={()=>{cancelRef.current=true}} style={{background:'none',border:'1px solid #e5e7eb',borderRadius:6,padding:'5px 12px',fontSize:12,color:'#dc2626',cursor:'pointer'}}>Cancel</button></div>}
            {batchRes&&<>
              {batchRes.length>0&&<><div style={{fontSize:11,color:'#9ca3af',textTransform:'uppercase',fontWeight:600,marginBottom:6}}>Preview</div>
              <div style={{maxHeight:160,overflowY:'auto',marginBottom:12}}>{batchRes.slice(0,3).map((r,i)=><div key={i} style={{background:'#f8f9fa',borderRadius:8,padding:10,marginBottom:6,border:'1px solid #f0f0f2'}}><div style={{fontSize:12,fontWeight:600,marginBottom:2}}>{r.first_name} {r.last_name} &middot; {r.email}</div><div style={{fontSize:12,color:'#4b5563',lineHeight:1.5,maxHeight:44,overflow:'hidden'}}>{r.custom_email_body}</div></div>)}</div></>}
              {batchRes.length===0&&<p style={{fontSize:13,color:'#9ca3af',marginBottom:12}}>No emails were generated. Check your API key configuration.</p>}
              <p style={{fontSize:13,color:'#4b5563',marginBottom:12}}>Export as CSV and upload into Instantly or your outreach tool. Each row has the email address and a custom email body written for that property.</p>
              <div style={{display:'flex',gap:8}}>
                {batchRes.length>0&&<button onClick={()=>exportEmailCSV(batchRes)} style={{flex:1,background:'#111827',border:'none',borderRadius:10,padding:'9px',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}><Download size={14}/>Export CSV</button>}
                <button onClick={()=>setBatchRes(null)} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,padding:'9px 14px',fontSize:13,color:'#9ca3af',cursor:'pointer'}}>{batchRes.length>0?'Close':'Dismiss'}</button>
              </div>
            </>}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="topnav">
        <div className="topnav__left">
          <button onClick={goBack} style={{background:'none',border:'none',display:'flex',alignItems:'center',padding:4,color:'#9ca3af',cursor:'pointer',marginRight:4}}><ArrowLeft size={16}/></button>
          <div className="topnav__brand"><Target size={18}/>Lead Intel</div>
          <div className="tab-group">
            {[['dashboard','Dashboard',BarChart3],['leads','Call List',Phone]].map(([id,label,Ic])=>
              <button key={id} onClick={()=>setTab(id)} className={`tab-btn ${tab===id?'tab-btn--active':''}`}><Ic size={13}/>{label}</button>)}
          </div>
          {saving&&<div className="save-indicator"><Loader2 size={12} className="spinning"/>Saving...</div>}
        </div>
        <div className="topnav__right">
          <button onClick={runBatch} disabled={batchOn||!leads?.some(l=>l.hasEmail)} style={{background:'#111827',border:'none',borderRadius:10,padding:'6px 14px',color:'#fff',display:'flex',alignItems:'center',gap:5,fontSize:13,fontWeight:600,cursor:(batchOn||!leads?.some(l=>l.hasEmail))?'default':'pointer',opacity:(batchOn||!leads?.some(l=>l.hasEmail))?0.4:1}}><Sparkles size={14}/>Email Campaign</button>
          <button onClick={()=>exportMojoCSV(leads)} className="export-btn export-btn--mojo"><PhoneCall size={13}/>Mojo CSV</button>
          <button onClick={()=>exportRankedXLSX(leads)} className="export-btn"><Download size={13}/>Export XLSX</button>
        </div>
      </nav>

      <div className="main-content">
        {tab==='dashboard'&&(
          <div className="fade-in">
            <div className="page-header"><h2>Dashboard</h2><p>{stats.total} leads scored and ranked</p></div>
            <div className="stats-grid">
              <Stat icon={Users} label="Total Leads" value={stats.total}/>
              <Stat icon={Phone} label="With Phone" value={stats.callable} sub={stats.total?`${Math.round(stats.callable/stats.total*100)}% of leads`:''} accent="#16a34a"/>
              <Stat icon={Mail} label="With Email" value={stats.withEmail} accent="#2563eb"/>
              <Stat icon={TrendingUp} label="Avg Score" value={stats.avgScore} sub="out of 100" accent="#d97706"/>
              <Stat icon={Clock} label="Avg Days on Market" value={stats.avgDom!=null?stats.avgDom:'N/A'} accent="#7c3aed"/>
            </div>
            <div className="charts-grid">
              <div className="chart-card"><div className="chart-title">Lead Tiers</div><div className="chart-row"><ResponsiveContainer width="50%" height={140}><PieChart><Pie data={tierPie} cx="50%" cy="50%" outerRadius={60} innerRadius={35} dataKey="value" stroke="none">{tierPie.map((d,i)=><Cell key={i} fill={d.color}/>)}</Pie></PieChart></ResponsiveContainer><div className="tier-legend">{Object.entries(TIERS).map(([k,v])=><div key={k} className="tier-legend__row"><div style={{display:'flex',alignItems:'center',gap:9}}><div className="tier-legend__dot" style={{background:v.color}}/><span className="tier-legend__label">{k}</span></div><span className="tier-legend__count" style={{color:v.color}}>{stats.tiers?.[k]||0}</span></div>)}</div></div></div>
              <div className="chart-card"><div className="chart-title">Property Types</div><ResponsiveContainer width="100%" height={140}><BarChart data={typesBar} barSize={26}><XAxis dataKey="name" tick={{fill:'#9ca3af',fontSize:11}} axisLine={false} tickLine={false}/><YAxis tick={{fill:'#9ca3af',fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:8,fontSize:12,boxShadow:'0 4px 12px rgba(0,0,0,0.06)'}}/><Bar dataKey="value" fill="#111827" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div>
            </div>
            <div className="chart-card">
              <div className="hot-leads-header"><span className="chart-title">Highest Scoring Leads</span><button onClick={()=>{setTab('leads');setTierFilter('A - Hot')}} className="link-btn">View all</button></div>
              {leads.slice(0,8).map(l=><div key={l.id} className="hot-lead-row"><div className="hot-lead-score" style={{background:TIERS[l.tier]?.bg,color:TIERS[l.tier]?.color}}>{l.score}</div><div className="hot-lead-info"><div className="hot-lead-addr">{l.address}</div><div className="hot-lead-intel">{l.intel}</div></div><div className="hot-lead-icons">{l.callablePhones>0&&<Phone size={14} color="#16a34a"/>}{l.hasEmail&&<Mail size={14} color="#2563eb"/>}</div></div>)}
            </div>
          </div>
        )}

        {tab==='leads'&&(
          <div className="fade-in">
            <div className="page-header"><h2>Call List</h2><p>Sorted by score. Click any lead for details and AI outreach.</p></div>
            <div className="filters-bar">
              <div className="search-input-wrap"><Search size={14} color="#9ca3af" className="search-icon"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by address, name, or city" className="search-input"/>{search&&<button onClick={()=>setSearch('')} className="search-clear"><X size={12}/></button>}</div>
              <div className="tier-filters">{[['all','All'],...Object.entries(TIERS).map(([k,v])=>[k,v.label])].map(([v,l])=><button key={v} onClick={()=>setTierFilter(v)} className={`tier-filter-btn ${tierFilter===v?'tier-filter-btn--active':''}`}>{l}</button>)}</div>
              <span className="lead-count">{filtered.length} leads</span>
            </div>
            <div className="table-card">
              <div className="table-header"><span>Tier</span><span className="sortable" onClick={()=>toggleSort('score')}>Score <ArrowUpDown size={9}/></span><span>Property</span><span className="th-contact">Owner</span><span className="sortable" onClick={()=>toggleSort('daysOnMarket')}>DOM <ArrowUpDown size={9}/></span><span className="th-price sortable" onClick={()=>toggleSort('listPrice')}>Price <ArrowUpDown size={9}/></span><span className="th-reach">Reach</span></div>
              <div className="table-body">{filtered.map(l=>(
                <div key={l.id}>
                  <div className={`lead-row ${expandedId===l.id?'lead-row--expanded':''}`} onClick={()=>setExpandedId(expandedId===l.id?null:l.id)}>
                    <span className="td-tier"><TierBadge tier={l.tier}/></span>
                    <span className="td-score" style={{color:TIERS[l.tier]?.color}}>{l.score}</span>
                    <span className="td-property"><div className="lead-addr">{l.address}</div><div className="lead-intel">{l.intel}</div></span>
                    <span className="td-contact">{l.fullName}</span>
                    <span className="td-dom" style={{color:l.daysOnMarket>=180?'#dc2626':l.daysOnMarket>=90?'#d97706':'#4b5563'}}>{l.daysOnMarket!=null?`${l.daysOnMarket}d`:''}</span>
                    <span className="td-price">{l.listPrice?`$${l.listPrice>=1e6?(l.listPrice/1e6).toFixed(1)+'M':Math.round(l.listPrice/1000)+'K'}`:''}</span>
                    <span className="td-reach">{l.callablePhones>0&&<Phone size={13} color="#16a34a"/>}{l.hasEmail&&<Mail size={13} color="#2563eb"/>}{expandedId===l.id?<ChevronDown size={13} color="#9ca3af"/>:<ChevronRight size={13} color="#9ca3af"/>}</span>
                  </div>
                  {expandedId===l.id&&<Detail l={l} ai={ai} aiL={aiL} gen={genAI}/>}
                </div>
              ))}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Detail({l,ai,aiL,gen}){return(
  <div className="lead-detail"><div className="detail-grid">
    <div><div className="detail-section__title">Phone Numbers</div>{l.phones?.length?l.phones.map((p,i)=><div key={i} className="phone-row"><span className="phone-num">{p.num}</span><span className="phone-type">{p.type}</span></div>):<span className="detail-empty">No phone numbers available</span>}</div>
    <div><div className="detail-section__title">Email</div>{l.emails?.length?l.emails.map((e,i)=><div key={i} className="email-row">{e}</div>):<span className="detail-empty">No email available</span>}{l.secondName&&<><div className="detail-section__title" style={{marginTop:10}}>Co-Owner</div><div style={{fontSize:13,color:'#4b5563'}}>{l.secondName}</div></>}</div>
    <div><div className="detail-section__title">Property</div><div className="detail-props">{l.propType&&<div>{l.propType}</div>}{l.beds&&<div>{l.beds} bed / {l.baths} bath{l.sqft?`, ${l.sqft.toLocaleString()} sqft`:''}</div>}{l.yearBuilt&&<div>Built in {l.yearBuilt}</div>}{l.listPrice&&<div>Listed at ${l.listPrice.toLocaleString()}</div>}{l.daysOnMarket!=null&&<div>{l.daysOnMarket} days on market</div>}{l.statusChangeDate&&<div>Expired on {l.statusChangeDate}</div>}{l.listAgent&&<div>Previous agent: {l.listAgent}</div>}{l.listOffice&&<div>Previous brokerage: {l.listOffice}</div>}{l.mlsId&&<div>MLS {l.mlsId}</div>}</div></div>
  </div>
  {l.scoreNotes&&<><div className="detail-section__title">Why this lead scored {l.score}</div><div className="score-notes">{l.scoreNotes}</div></>}
  <div style={{borderTop:'1px solid #e5e7eb',paddingTop:14,marginTop:14}}>
    <div className="detail-section__title">AI Outreach</div>
    <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
      {[['email','Write Email',Mail],['script','Write Call Script',Phone]].map(([t,lb,Ic])=>{const k=`${l.id}-${t}`;if(ai[k])return null;return<button key={t} onClick={e=>{e.stopPropagation();gen(l.id,t)}} disabled={aiL[k]} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:8,padding:'7px 12px',color:aiL[k]?'#9ca3af':'#111827',cursor:aiL[k]?'default':'pointer',display:'flex',alignItems:'center',gap:6,fontSize:13,fontWeight:500}}>{aiL[k]?<Loader2 size={14} className="spinning"/>:<Ic size={14}/>}{aiL[k]?'Writing...':lb}</button>})}
    </div>
    {['email','script'].map(t=>{const k=`${l.id}-${t}`;if(!ai[k])return null;const nm={email:'Personalized Email',script:'Call Script'};const ic={email:Mail,script:Phone};const I=ic[t];return(
      <div key={t} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,padding:14,marginBottom:8,boxShadow:'0 1px 2px rgba(0,0,0,0.02)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}><div style={{display:'flex',alignItems:'center',gap:6,fontSize:13,fontWeight:600}}><I size={14}/>{nm[t]}</div><CopyBtn text={ai[k]}/></div>
        <pre style={{fontSize:13,color:'#4b5563',lineHeight:1.7,whiteSpace:'pre-wrap',fontFamily:'inherit',margin:0}}>{ai[k]}</pre>
      </div>)})}
  </div></div>
)}
