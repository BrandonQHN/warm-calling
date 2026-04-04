import * as XLSX from 'xlsx'

function fmtPhone(num) {
  if (!num || num.length !== 10) return num || ''
  return `(${num.slice(0,3)}) ${num.slice(3,6)}-${num.slice(6)}`
}

export function exportRankedXLSX(leads, filename = 'Lead_Intel_Ranked.xlsx') {
  const rows = leads.map(l => ({
    'Tier': l.tier, 'Score': l.score, 'Pre-Call Intel': l.intel,
    'Address': l.address, 'City': l.city, 'State': l.state || 'FL', 'Zip': l.zip,
    'Owner Names': l.contactNames,
    'Phone 1': fmtPhone(l.phones?.[0]?.num), 'P1 Type': l.phones?.[0]?.type || '', 'P1 DNC': l.phones?.[0]?.dnc ? 'DNC' : '',
    'Phone 2': fmtPhone(l.phones?.[1]?.num), 'P2 Type': l.phones?.[1]?.type || '', 'P2 DNC': l.phones?.[1]?.dnc ? 'DNC' : '',
    'Phone 3': fmtPhone(l.phones?.[2]?.num), 'P3 Type': l.phones?.[2]?.type || '', 'P3 DNC': l.phones?.[2]?.dnc ? 'DNC' : '',
    'Email 1': l.emails?.[0] || '', 'Email 2': l.emails?.[1] || '',
    'Owner Occupied': l.ownerOcc || '', 'Property Type': l.propType || '',
    'Beds': l.beds || '', 'Baths': l.baths || '', 'Sqft': l.sqft || '',
    'MLS Price': l.mlsAmount || '', 'Est Value': l.estValue || '', 'Est Equity': l.equity || '',
    'LTV': l.ltv != null ? `${Math.round(l.ltv * 100)}%` : '',
    'Expired Date': l.mlsDate || '', 'Score Notes': l.notes || '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    {wch:10},{wch:6},{wch:50},{wch:25},{wch:12},{wch:5},{wch:8},{wch:28},
    {wch:15},{wch:8},{wch:5},{wch:15},{wch:8},{wch:5},{wch:15},{wch:8},{wch:5},
    {wch:26},{wch:26},{wch:8},{wch:18},{wch:5},{wch:5},{wch:7},
    {wch:12},{wch:12},{wch:12},{wch:6},{wch:12},{wch:22},
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ranked Leads')
  XLSX.writeFile(wb, filename)
}

// Mojo Dialer CSV: one row per lead, non-DNC phones only, sorted by score
export function exportMojoCSV(leads, filename = 'Mojo_Import.csv') {
  const rows = []
  leads.forEach(l => {
    const phones = (l.phones || []).filter(p => !p.dnc)
    if (phones.length === 0) return
    const firstName = l.contactNames?.split('|')[0]?.trim()?.split(' ')[0] || l.ownerFirst || ''
    const lastName = l.contactNames?.split('|')[0]?.trim()?.split(' ').slice(1).join(' ') || l.ownerLast || ''
    rows.push({
      'First Name': firstName, 'Last Name': lastName,
      'Phone': phones[0].num, 'Phone 2': phones[1]?.num || '', 'Phone 3': phones[2]?.num || '',
      'Address': l.address, 'City': l.city, 'State': l.state || 'FL', 'Zip': l.zip,
      'Notes': `[${l.tier}] Score:${l.score} | ${l.intel}`,
    })
  })
  const ws = XLSX.utils.json_to_sheet(rows)
  const csv = XLSX.utils.sheet_to_csv(ws)
  downloadBlob(csv, 'text/csv;charset=utf-8;', filename)
}

// Instantly-ready CSV from batch email results
export function exportEmailCampaignCSV(results, filename = 'Email_Campaign_Instantly.csv') {
  const ws = XLSX.utils.json_to_sheet(results)
  const csv = XLSX.utils.sheet_to_csv(ws)
  downloadBlob(csv, 'text/csv;charset=utf-8;', filename)
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function computeStats(leads) {
  if (!leads?.length) return {}
  const tiers = {}
  leads.forEach(l => { tiers[l.tier] = (tiers[l.tier] || 0) + 1 })
  const withEquity = leads.filter(l => l.equity != null)
  const propTypes = leads.reduce((acc, l) => {
    const pt = l.propType || ''
    const t = pt.includes('Condo') ? 'Condo' : pt.includes('Single') ? 'SFR' :
      pt.includes('Town') ? 'TH' : (pt.includes('Duplex') || pt.includes('Multi')) ? 'MF' : 'Other'
    acc[t] = (acc[t] || 0) + 1
    return acc
  }, {})
  return {
    total: leads.length,
    callable: leads.filter(l => l.callablePhones > 0).length,
    withEmail: leads.filter(l => l.hasEmail).length,
    avgScore: Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length),
    avgEquity: withEquity.length > 0 ? Math.round(withEquity.reduce((s, l) => s + l.equity, 0) / withEquity.length) : 0,
    tiers, propTypes,
  }
}
