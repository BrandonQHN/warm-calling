import * as XLSX from 'xlsx'

function ph(n) { return !n || n.length !== 10 ? (n || '') : `(${n.slice(0,3)}) ${n.slice(3,6)}-${n.slice(6)}` }
function dl(c, t, f) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([c], { type: t })); a.download = f; a.click(); URL.revokeObjectURL(a.href) }

export function exportRankedXLSX(leads, filename = 'Ranked_Leads.xlsx') {
  const ws = XLSX.utils.json_to_sheet(leads.map(l => ({
    Tier: l.tier, Score: l.score, Intel: l.intel, 'Full Name': l.fullName,
    'Property Address': l.address, City: l.city, State: l.state, Zip: l.zip,
    'Phone 1': ph(l.phones?.[0]?.num), 'Phone 2': ph(l.phones?.[1]?.num), 'Phone 3': ph(l.phones?.[2]?.num),
    Email: l.emails?.[0] || '', 'Property Type': l.propType, Beds: l.beds, Baths: l.baths, Sqft: l.sqft,
    'List Price': l.listPrice, 'Days On Market': l.daysOnMarket, Expired: l.statusChangeDate,
    'Year Built': l.yearBuilt, 'Previous Agent': l.listAgent, 'Previous Office': l.listOffice, 'MLS ID': l.mlsId,
  })))
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Ranked Leads'); XLSX.writeFile(wb, filename)
}

// Mojo Dialer CSV - exact column names Mojo expects for import
export function exportMojoCSV(leads, filename = 'Mojo_Ranked_Import.csv') {
  const ws = XLSX.utils.json_to_sheet(leads.filter(l => l.callablePhones > 0).map(l => ({
    'First Name': l.firstName, 'Last Name': l.lastName,
    'Property Address': l.address, 'Property City': l.city, 'Property State': l.state, 'Property Zip Code': l.zip,
    'Phone 1': l.phones?.[0]?.num || '', 'Phone 2': l.phones?.[1]?.num || '', 'Phone 3': l.phones?.[2]?.num || '',
    'Mobile 1': l.phones?.find(p => /mobile|cell/i.test(p.type))?.num || '',
    'Email 1': l.emails?.[0] || '',
    'Notes': `[Tier ${l.tier?.split(' - ')[0]}] Score ${l.score}/100 | ${l.intel}`,
  })))
  dl(XLSX.utils.sheet_to_csv(ws), 'text/csv;charset=utf-8;', filename)
}

export function exportEmailCSV(results, filename = 'Email_Campaign.csv') {
  dl(XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(results)), 'text/csv;charset=utf-8;', filename)
}

export function computeStats(leads) {
  if (!leads?.length) return { total: 0, callable: 0, withEmail: 0, avgScore: 0, avgDom: null, tiers: {}, propTypes: {} }
  const tiers = {}, pt = {}
  let domSum = 0, domN = 0
  leads.forEach(l => {
    tiers[l.tier] = (tiers[l.tier] || 0) + 1
    const p = l.propType || ''
    const t = /Condo|Co.Op/i.test(p) ? 'Condo' : /Single/i.test(p) ? 'SFR' : /Town/i.test(p) ? 'TH' : /Duplex|Multi/i.test(p) ? 'MF' : 'Other'
    pt[t] = (pt[t] || 0) + 1
    if (l.daysOnMarket != null) { domSum += l.daysOnMarket; domN++ }
  })
  return {
    total: leads.length, callable: leads.filter(l => l.callablePhones > 0).length,
    withEmail: leads.filter(l => l.hasEmail).length,
    avgScore: Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length),
    avgDom: domN ? Math.round(domSum / domN) : null, tiers, propTypes: pt,
  }
}
