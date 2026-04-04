import { useState, useMemo, useCallback, useRef } from 'react'
import {
  Phone, Mail, TrendingUp, Download, ChevronDown, ChevronRight,
  Star, Zap, BarChart3, Users, Target, Search, X, Copy, Check,
  Loader2, FileSpreadsheet, ArrowUpDown, Sparkles, PhoneCall,
  AlertCircle,
} from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { readFile, processFiles } from './lib/parser'
import { TIERS } from './lib/scoring'
import { exportRankedXLSX, exportMojoCSV, exportEmailCampaignCSV, computeStats } from './lib/exporter'
import { generateForLead, batchGenerateEmails } from './lib/ai'
import { createList, insertLeads, supabase } from './lib/supabase'

// Utility components

function Stat({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="stat-card">
      <div className="stat-header">
        <Icon size={14} color={accent || '#9b9ca7'} />
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <button onClick={copy} className="copy-btn">
      {copied ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function DropZone({ label, desc, file, onFile, accept }) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)
  return (
    <div className={`drop-zone ${file ? 'drop-zone--done' : ''} ${drag ? 'drop-zone--active' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]) }}>
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }}
        onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
      <div className={`drop-zone__icon ${file ? 'drop-zone__icon--done' : ''}`}>
        {file ? <Check size={24} color="#16a34a" /> : <FileSpreadsheet size={24} color="#111113" />}
      </div>
      <div className="drop-zone__label">{label}</div>
      <div className="drop-zone__desc">{file ? file.name : desc}</div>
    </div>
  )
}

function TierBadge({ tier }) {
  const t = TIERS[tier]
  if (!t) return null
  return (
    <span className="tier-badge tier-badge--sm" style={{ background: t.bg, color: t.color }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.color, display: 'inline-block' }} />
      {t.label}
    </span>
  )
}

// Main App

export default function App() {
  const [propFile, setPropFile] = useState(null)
  const [contactFile, setContactFile] = useState(null)
  const [leads, setLeads] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('dashboard')
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [sortField, setSortField] = useState('score')
  const [sortDir, setSortDir] = useState('desc')
  const [listName, setListName] = useState('')
  // Per-lead AI
  const [ai, setAi] = useState({})
  const [aiLoading, setAiLoading] = useState({})
  // Batch email campaign
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchDone, setBatchDone] = useState(0)
  const [batchTotal, setBatchTotal] = useState(0)
  const [batchResults, setBatchResults] = useState(null)
  const cancelRef = useRef(false)

  const handleProcess = useCallback(async () => {
    if (!propFile || !contactFile) return
    setProcessing(true); setError(null)
    try {
      const [propRows, contactRows] = await Promise.all([readFile(propFile), readFile(contactFile)])
      const merged = processFiles(propRows, contactRows)
      setLeads(merged); setTab('dashboard')
      if (supabase) {
        setSaving(true)
        const name = listName || propFile.name.replace(/\.[^.]+$/, '')
        const listId = await createList(name, 'Miami')
        if (listId) await insertLeads(listId, merged)
        setSaving(false)
      }
    } catch (e) { setError(e.message) }
    setProcessing(false)
  }, [propFile, contactFile, listName])

  const filtered = useMemo(() => {
    if (!leads) return []
    let f = leads
    if (tierFilter !== 'all') f = f.filter(l => l.tier === tierFilter)
    if (search) {
      const s = search.toLowerCase()
      f = f.filter(l => l.address.toLowerCase().includes(s) || l.contactNames.toLowerCase().includes(s) || l.city.toLowerCase().includes(s))
    }
    const dir = sortDir === 'desc' ? -1 : 1
    return [...f].sort((a, b) => {
      const av = a[sortField], bv = b[sortField]
      if (av == null) return 1; if (bv == null) return -1
      return av > bv ? dir : av < bv ? -dir : 0
    })
  }, [leads, tierFilter, search, sortField, sortDir])

  const stats = useMemo(() => computeStats(leads), [leads])

  const toggleSort = field => {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortField(field); setSortDir('desc') }
  }

  // Per-lead AI generation
  const handleGenerate = async (leadId, type) => {
    const key = `${leadId}-${type}`
    if (ai[key]) return
    setAiLoading(p => ({ ...p, [key]: true }))
    try {
      const lead = leads.find(l => l.id === leadId)
      const content = await generateForLead(lead, type)
      setAi(p => ({ ...p, [key]: content }))
    } catch (e) { setAi(p => ({ ...p, [key]: 'Error: ' + e.message })) }
    setAiLoading(p => ({ ...p, [key]: false }))
  }

  // Batch email campaign
  const runBatchEmails = async () => {
    if (!leads) return
    const emailCount = leads.filter(l => l.hasEmail).length
    if (emailCount === 0) return
    setBatchRunning(true); setBatchDone(0); setBatchTotal(emailCount)
    setBatchResults(null); cancelRef.current = false
    try {
      const results = await batchGenerateEmails(leads, (done, total) => {
        setBatchDone(done); setBatchTotal(total)
      }, cancelRef)
      setBatchResults(results)
    } catch (e) {
      console.error('Batch generation error:', e)
      setBatchResults([])
    }
    setBatchRunning(false)
  }

  const pct = batchTotal > 0 ? Math.round(batchDone / batchTotal * 100) : 0

  // Upload screen
  if (!leads) {
    return (
      <div className="app">
        <div className="upload-container">
          <div className="upload-header">
            <div className="badge"><Target size={14} /> Lead Intelligence</div>
            <h1>Score, rank, and work your expired leads</h1>
            <p>Upload your property export and skip-traced contacts. We merge them, score every lead, and give you a ranked call sheet, Mojo CSV, and AI email campaign.</p>
          </div>
          <div className="upload-zones">
            <DropZone label="Property Export" desc=".xlsx or .csv from PropStream" file={propFile} onFile={setPropFile} accept=".xlsx,.xls,.csv" />
            <DropZone label="Skip Traced Contacts" desc=".csv contact export" file={contactFile} onFile={setContactFile} accept=".xlsx,.xls,.csv" />
          </div>
          {propFile && contactFile && (
            <input type="text" className="list-name-input" placeholder="List name (optional)" value={listName} onChange={e => setListName(e.target.value)} />
          )}
          {error && <div className="error-banner"><AlertCircle size={14} />{error}</div>}
          <button onClick={handleProcess} disabled={!propFile || !contactFile || processing}
            className={`process-btn ${propFile && contactFile ? 'process-btn--ready' : ''}`}>
            {processing ? <><Loader2 size={18} className="spinning" /> Processing leads...</> : <><Zap size={18} /> Score & Rank Leads</>}
          </button>
          {!supabase && <div className="env-notice"><span>Running in local mode.</span> Add Supabase credentials to .env to persist leads.</div>}
        </div>
      </div>
    )
  }

  const tierPieData = stats.tiers ? Object.entries(TIERS).map(([k, v]) => ({ name: k, value: stats.tiers[k] || 0, color: v.color })) : []
  const typesBarData = stats.propTypes ? Object.entries(stats.propTypes).map(([k, v]) => ({ name: k, value: v })) : []

  return (
    <div className="app">

      {/* Batch email modal */}
      {(batchRunning || batchResults) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { if (!batchRunning && batchResults) setBatchResults(null) }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 32, width: 480, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: batchResults ? '#edf9f0' : '#eff4ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {batchRunning ? <Loader2 size={20} color="#2563eb" className="spinning" /> : <Check size={20} color="#16a34a" />}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{batchRunning ? 'Generating Email Campaign...' : 'Email Campaign Ready'}</div>
                <div style={{ fontSize: 13, color: '#9b9ca7' }}>{batchRunning ? `${batchDone} of ${batchTotal} emails generated` : `${batchResults?.length} personalized emails generated`}</div>
              </div>
            </div>
            <div style={{ background: '#f2f3f5', borderRadius: 6, height: 8, marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ background: batchResults ? '#16a34a' : '#2563eb', height: '100%', borderRadius: 6, width: `${pct}%`, transition: 'width 0.3s ease' }} />
            </div>
            {batchRunning && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: '#9b9ca7' }}>{pct}% complete</div>
                <button onClick={() => { cancelRef.current = true }} style={{ background: '#fff', border: '1px solid #e8e9ec', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, color: '#dc3545', cursor: 'pointer' }}>Cancel</button>
              </div>
            )}
            {batchResults && (
              <div>
                <div style={{ fontSize: 12, color: '#9b9ca7', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>Preview</div>
                <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16 }}>
                  {batchResults.slice(0, 3).map((r, i) => (
                    <div key={i} style={{ background: '#fafafa', borderRadius: 8, padding: 12, marginBottom: 8, border: '1px solid #f0f0f2' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{r.first_name} {r.last_name} . {r.email}</div>
                      <div style={{ fontSize: 12, color: '#5f6068', lineHeight: 1.5, maxHeight: 60, overflow: 'hidden' }}>{r.custom_email_body}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: '#5f6068', marginBottom: 16 }}>
                  CSV columns: email, first_name, last_name, address, city, state, tier, score, custom_email_body. Upload directly into Instantly as a campaign.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => exportEmailCampaignCSV(batchResults)} style={{ flex: 1, background: '#111113', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Download size={16} /> Export CSV for Instantly
                  </button>
                  <button onClick={() => setBatchResults(null)} style={{ background: '#fff', border: '1px solid #e8e9ec', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 500, color: '#9b9ca7', cursor: 'pointer' }}>Close</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="topnav">
        <div className="topnav__left">
          <div className="topnav__brand"><Target size={18} /> Lead Intel</div>
          <div className="tab-group">
            {[['dashboard', 'Dashboard', BarChart3], ['leads', 'Call List', Phone]].map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTab(id)} className={`tab-btn ${tab === id ? 'tab-btn--active' : ''}`}>
                <Icon size={13} />{label}
              </button>
            ))}
          </div>
          {saving && <div className="save-indicator"><Loader2 size={12} className="spinning" /> Saving...</div>}
        </div>
        <div className="topnav__right">
          <button onClick={runBatchEmails} disabled={batchRunning}
            style={{ background: '#111113', border: 'none', borderRadius: 10, padding: '7px 16px', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: batchRunning ? 'default' : 'pointer', opacity: batchRunning ? 0.6 : 1 }}>
            <Sparkles size={14} /> Generate Email Campaign
          </button>
          <button onClick={() => exportMojoCSV(leads)} className="export-btn export-btn--mojo"><PhoneCall size={14} /> Mojo CSV</button>
          <button onClick={() => exportRankedXLSX(leads)} className="export-btn"><Download size={14} /> Ranked XLSX</button>
        </div>
      </nav>

      <div className="main-content">

        {/* Dashboard */}
        {tab === 'dashboard' && (
          <div className="fade-in">
            <div className="page-header">
              <h2>Dashboard</h2>
              <p>{stats.total} expired leads scored and ranked</p>
            </div>
            <div className="stats-grid">
              <Stat icon={Users} label="Total Leads" value={stats.total} />
              <Stat icon={Phone} label="Callable" value={stats.callable} sub={`${Math.round(stats.callable / stats.total * 100)}% hit rate`} accent="#16a34a" />
              <Stat icon={Mail} label="Has Email" value={stats.withEmail} accent="#2563eb" />
              <Stat icon={TrendingUp} label="Avg Score" value={stats.avgScore} sub="/100" accent="#d97706" />
              <Stat icon={Star} label="Avg Equity" value={`$${Math.round(stats.avgEquity / 1000)}K`} accent="#7c3aed" />
            </div>
            <div className="charts-grid">
              <div className="chart-card">
                <div className="chart-title">Tier Breakdown</div>
                <div className="chart-row">
                  <ResponsiveContainer width="50%" height={160}>
                    <PieChart><Pie data={tierPieData} cx="50%" cy="50%" outerRadius={70} innerRadius={40} dataKey="value" stroke="none">
                      {tierPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie></PieChart>
                  </ResponsiveContainer>
                  <div className="tier-legend">
                    {Object.entries(TIERS).map(([k, v]) => (
                      <div key={k} className="tier-legend__row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="tier-legend__dot" style={{ background: v.color }} />
                          <span className="tier-legend__label">{k}</span>
                        </div>
                        <span className="tier-legend__count" style={{ color: v.color }}>{stats.tiers?.[k] || 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="chart-card">
                <div className="chart-title">Property Types</div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={typesBarData} barSize={32}>
                    <XAxis dataKey="name" tick={{ fill: '#9b9ca7', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#9b9ca7', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e8e9ec', borderRadius: 8, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                    <Bar dataKey="value" fill="#111113" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="chart-card">
              <div className="hot-leads-header">
                <span className="chart-title">Top Hot Leads</span>
                <button onClick={() => { setTab('leads'); setTierFilter('A - Hot') }} className="link-btn">View all</button>
              </div>
              {leads.slice(0, 10).map(l => (
                <div key={l.id} className="hot-lead-row">
                  <div className="hot-lead-score" style={{ background: TIERS[l.tier]?.bg, color: TIERS[l.tier]?.color }}>{l.score}</div>
                  <div className="hot-lead-info">
                    <div className="hot-lead-addr">{l.address}</div>
                    <div className="hot-lead-intel">{l.intel}</div>
                  </div>
                  <div className="hot-lead-icons">
                    {l.callablePhones > 0 && <Phone size={14} color="#16a34a" />}
                    {l.hasEmail && <Mail size={14} color="#2563eb" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Call List */}
        {tab === 'leads' && (
          <div className="fade-in">
            <div className="page-header">
              <h2>Call List</h2>
              <p>Click any lead to view details and generate AI outreach</p>
            </div>
            <div className="filters-bar">
              <div className="search-input-wrap">
                <Search size={14} color="#9b9ca7" className="search-icon" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search address, name, city..." className="search-input" />
                {search && <button onClick={() => setSearch('')} className="search-clear"><X size={12} /></button>}
              </div>
              <div className="tier-filters">
                {[['all', 'All'], ...Object.entries(TIERS).map(([k, v]) => [k, v.label])].map(([val, label]) => (
                  <button key={val} onClick={() => setTierFilter(val)} className={`tier-filter-btn ${tierFilter === val ? 'tier-filter-btn--active' : ''}`}>{label}</button>
                ))}
              </div>
              <span className="lead-count">{filtered.length} leads</span>
            </div>
            <div className="table-card">
              <div className="table-header">
                <span>Status</span>
                <span className="sortable" onClick={() => toggleSort('score')}>Score <ArrowUpDown size={10} /></span>
                <span>Property / Intel</span>
                <span className="th-contact">Contact</span>
                <span className="sortable" onClick={() => toggleSort('equity')}>Equity <ArrowUpDown size={10} /></span>
                <span className="th-mls sortable" onClick={() => toggleSort('mlsAmount')}>Listed <ArrowUpDown size={10} /></span>
                <span className="th-reach">Reach</span>
              </div>
              <div className="table-body">
                {filtered.map(l => (
                  <div key={l.id}>
                    <div className={`lead-row ${expandedId === l.id ? 'lead-row--expanded' : ''}`}
                      onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}>
                      <span className="td-tier"><TierBadge tier={l.tier} /></span>
                      <span className="td-score" style={{ color: TIERS[l.tier]?.color }}>{l.score}</span>
                      <span className="td-property">
                        <div className="lead-addr">{l.address}</div>
                        <div className="lead-intel">{l.intel}</div>
                      </span>
                      <span className="td-contact">{l.contactNames || ''}</span>
                      <span className="td-equity" style={{ color: l.equity > 0 ? '#16a34a' : '#dc3545' }}>
                        {l.equity != null ? (l.equity < 0 ? `-$${Math.round(Math.abs(l.equity) / 1000)}K` : `$${Math.round(l.equity / 1000)}K`) : ''}
                      </span>
                      <span className="td-mls">{l.mlsAmount ? (l.mlsAmount > 1000 ? `$${Math.round(l.mlsAmount / 1000)}K` : `$${l.mlsAmount}`) : ''}</span>
                      <span className="td-reach">
                        {l.callablePhones > 0 && <Phone size={13} color="#16a34a" />}
                        {l.hasEmail && <Mail size={13} color="#2563eb" />}
                        {expandedId === l.id ? <ChevronDown size={13} color="#9b9ca7" /> : <ChevronRight size={13} color="#9b9ca7" />}
                      </span>
                    </div>
                    {expandedId === l.id && <LeadDetail lead={l} ai={ai} aiLoading={aiLoading} onGenerate={handleGenerate} />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Expanded lead detail with AI generation

function LeadDetail({ lead: l, ai, aiLoading, onGenerate }) {
  return (
    <div className="lead-detail">
      <div className="detail-grid">
        <div>
          <div className="detail-section__title">Phones</div>
          {l.phones?.length > 0 ? l.phones.map((p, i) => (
            <div key={i} className="phone-row">
              <span className={`phone-num ${p.dnc ? 'phone-num--dnc' : ''}`}>{p.num}</span>
              <span className="phone-type">{p.type}</span>
              {p.dnc && <span className="dnc-badge">DNC</span>}
            </div>
          )) : <span className="detail-empty">No phones found</span>}
        </div>
        <div>
          <div className="detail-section__title">Emails</div>
          {l.emails?.length > 0 ? l.emails.map((e, i) => (
            <div key={i} className="email-row">{e}</div>
          )) : <span className="detail-empty">No emails found</span>}
        </div>
        <div>
          <div className="detail-section__title">Property Details</div>
          <div className="detail-props">
            {l.propType && <div>{l.propType}</div>}
            {l.beds && <div>{l.beds}bd / {l.baths}ba . {l.sqft?.toLocaleString()}sf</div>}
            <div>{l.ownerOcc === 'Yes' ? 'Owner Occupied' : 'Absentee'}</div>
            {l.estValue && <div>Est Value: ${l.estValue.toLocaleString()}</div>}
            {l.ltv != null && <div>LTV: {Math.round(l.ltv * 100)}%</div>}
            {l.yearBuilt && <div>Built: {l.yearBuilt}</div>}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div className="detail-section__title">Score Breakdown</div>
        <div className="score-notes">{l.notes || 'Standard scoring'}</div>
      </div>

      {/* AI Outreach */}
      <div style={{ borderTop: '1px solid #e8e9ec', paddingTop: 16 }}>
        <div className="detail-section__title">AI Outreach</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {[['email', 'Generate Email', Mail], ['script', 'Generate Opener Script', Phone]].map(([type, label, Icon]) => {
            const k = `${l.id}-${type}`
            if (ai[k]) return null
            return (
              <button key={type} onClick={e => { e.stopPropagation(); onGenerate(l.id, type) }} disabled={aiLoading[k]}
                style={{ background: '#fff', border: '1px solid #e8e9ec', borderRadius: 8, padding: '8px 14px', color: aiLoading[k] ? '#9b9ca7' : '#111113', cursor: aiLoading[k] ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 500 }}>
                {aiLoading[k] ? <Loader2 size={14} className="spinning" /> : <Icon size={14} />}
                {aiLoading[k] ? 'Generating...' : label}
              </button>
            )
          })}
        </div>
        {['email', 'script'].map(type => {
          const k = `${l.id}-${type}`
          if (!ai[k]) return null
          const labels = { email: 'Personalized Email', script: 'Opener Script' }
          const icons = { email: Mail, script: Phone }
          const I = icons[type]
          return (
            <div key={type} style={{ background: '#fff', border: '1px solid #e8e9ec', borderRadius: 10, padding: 16, marginBottom: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}><I size={14} /> {labels[type]}</div>
                <CopyBtn text={ai[k]} />
              </div>
              <pre style={{ fontSize: 13, color: '#5f6068', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{ai[k]}</pre>
            </div>
          )
        })}
      </div>
    </div>
  )
}
