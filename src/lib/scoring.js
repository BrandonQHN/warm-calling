export const TIERS = {
  'A - Hot':    { color: '#16a34a', bg: '#ecfdf5', label: 'A', min: 76 },
  'B - High':   { color: '#2563eb', bg: '#eff6ff', label: 'B', min: 61 },
  'C - Medium': { color: '#d97706', bg: '#fffbeb', label: 'C', min: 41 },
  'D - Low':    { color: '#94a3b8', bg: '#f1f5f9', label: 'D', min: 0 },
}

export function scoreLead(lead) {
  let score = 0, notes = []
  const dom = lead.daysOnMarket
  if (dom != null) {
    if (dom >= 180)      { score += 25; notes.push('180+ days on market') }
    else if (dom >= 120) { score += 20; notes.push('120+ days on market') }
    else if (dom >= 90)  { score += 15 }
    else if (dom >= 60)  { score += 10 }
    else if (dom >= 30)  { score += 7 }
    else                 { score += 3 }
  }
  const cp = lead.callablePhones || 0
  if (cp >= 3) score += 25
  else if (cp >= 2) score += 20
  else if (cp >= 1) score += 12
  else notes.push('No phone numbers found')
  const pt = lead.propType || ''
  if (pt.includes('Single Family')) { score += 15; notes.push('Single family home') }
  else if (/Townhou/i.test(pt)) score += 13
  else if (/Duplex|Multi/i.test(pt)) { score += 12; notes.push('Multi-family') }
  else if (/Condo|Co.Op/i.test(pt)) score += 8
  else score += 5
  if (lead.hasEmail) score += 10
  const dse = lead.daysSinceExpired
  if (dse != null) {
    if (dse === 0)       { score += 15; notes.push('Expired today') }
    else if (dse === 1)  { score += 14; notes.push('Expired yesterday') }
    else if (dse <= 3)   { score += 12; notes.push(`Expired ${dse} days ago`) }
    else if (dse <= 7)   { score += 10; notes.push(`Expired ${dse} days ago`) }
    else if (dse <= 14)  { score += 7 }
    else if (dse <= 30)  { score += 4 }
    else                 { score += 1 }
  }
  const p = lead.listPrice
  if (p != null && p > 0) {
    if (p >= 300000 && p <= 1500000) score += 10
    else if (p >= 150000 && p < 300000) score += 8
    else if (p > 1500000 && p <= 5000000) score += 6
    else if (p > 5000000) { score += 3; notes.push('Luxury price point') }
    else score += 4
  }
  let tier = 'D - Low'
  if (score >= 76) tier = 'A - Hot'
  else if (score >= 61) tier = 'B - High'
  else if (score >= 41) tier = 'C - Medium'
  return { score, tier, notes: notes.join(', ') }
}

export function buildIntel(lead) {
  const p = []
  if (lead.listPrice) p.push(`$${lead.listPrice.toLocaleString()}`)
  if (lead.daysOnMarket != null) p.push(`${lead.daysOnMarket} days on market`)
  const pt = lead.propType || ''
  for (const [m, t] of Object.entries({ 'Single Family': 'SFR', Townhou: 'Townhouse', Condo: 'Condo', 'Co-Op': 'Co-Op', Duplex: 'Duplex', Multi: 'Multi-family' })) { if (pt.includes(m)) { p.push(t); break } }
  if (lead.beds && lead.baths) p.push(`${lead.beds}bd/${lead.baths}ba`)
  if (lead.sqft) p.push(`${lead.sqft.toLocaleString()}sf`)
  if (lead.statusChangeDate) p.push(`Expired ${lead.statusChangeDate}`)
  if (lead.listOffice) p.push(lead.listOffice)
  return p.join(' \u00b7 ')
}
