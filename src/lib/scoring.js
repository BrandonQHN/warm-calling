// Lead scoring model for expired listings
// Weights tuned for Nucci's criteria: equity, owner status, property type, contactability, pricing gap

export const TIERS = {
  'A - Hot':    { color: '#16a34a', bg: '#edf9f0', label: 'A', icon: '🔥', min: 76 },
  'B - High':   { color: '#2563eb', bg: '#eff4ff', label: 'B', icon: '⚡', min: 61 },
  'C - Medium': { color: '#d97706', bg: '#fef9ec', label: 'C', icon: '📋', min: 41 },
  'D - Low':    { color: '#9b9ca7', bg: '#f4f4f6', label: 'D', icon: '💤', min: 0 },
}

export function scoreLead(lead) {
  let score = 0
  const notes = []

  // 1. Equity (0-25 pts)
  const eq = lead.equity
  if (eq != null) {
    if (eq >= 500000)      { score += 25; notes.push('High equity') }
    else if (eq >= 250000) { score += 20 }
    else if (eq >= 100000) { score += 15 }
    else if (eq >= 50000)  { score += 10 }
    else if (eq > 0)       { score += 5 }
    else                   { notes.push('Neg equity') }
  }

  // 2. Owner occupied (0-15 pts)
  if (lead.ownerOcc === 'Yes') { score += 15; notes.push('Owner-occ') }
  else { score += 8 }

  // 3. Property type (0-20 pts)
  const pt = lead.propType || ''
  if (pt.includes('Single Family'))                      { score += 20; notes.push('SFR') }
  else if (pt.includes('Townhouse'))                     { score += 18 }
  else if (pt.includes('Duplex') || pt.includes('Multi-Family')) { score += 17; notes.push('MF') }
  else if (pt.includes('Condominium'))                   { score += 10 }
  else                                                   { score += 5 }

  // 4. Contactability (0-20 pts)
  const cp = lead.callablePhones || 0
  if (cp >= 3)                               { score += 20 }
  else if (cp >= 2)                          { score += 15 }
  else if (cp >= 1)                          { score += 10 }
  else if ((lead.totalPhones || 0) > 0)      { score += 3 }
  else                                       { notes.push('No phones') }

  // 5. Price gap — overpriced = more motivated now (0-10 pts)
  const mls = lead.mlsAmount
  const ev = lead.estValue
  if (mls && ev && ev > 0 && mls > 1000) {
    const ratio = mls / ev
    if (ratio > 1.15)      { score += 10; notes.push('Overpriced') }
    else if (ratio > 1.05) { score += 7 }
    else if (ratio >= 0.95){ score += 5 }
    else                   { score += 3 }
  }

  // 6. Has email for follow-up (0-5 pts)
  if (lead.hasEmail) { score += 5 }

  // 7. LTV / free & clear (0-5 pts)
  const ltv = lead.ltv
  if (ltv != null) {
    if (ltv === 0)       { score += 5; notes.push('Free & clear') }
    else if (ltv < 0.5)  { score += 3 }
  }

  // Tier assignment
  let tier = 'D - Low'
  if (score >= 76)      tier = 'A - Hot'
  else if (score >= 61) tier = 'B - High'
  else if (score >= 41) tier = 'C - Medium'

  return { score, tier, notes: notes.join(' · ') }
}

export function buildIntel(lead) {
  const parts = []
  if (lead.mlsAmount) {
    parts.push(lead.mlsAmount > 1000 ? `Listed $${lead.mlsAmount.toLocaleString()}` : `$${lead.mlsAmount.toLocaleString()}/mo`)
  }
  if (lead.equity != null) {
    if (lead.equity < 0) parts.push('Underwater')
    else parts.push(`~$${lead.equity.toLocaleString()} equity`)
  }
  parts.push(lead.ownerOcc === 'Yes' ? 'Owner-occ' : 'Absentee')

  const pt = lead.propType || ''
  const typeMap = { 'Single Family': 'SFR', 'Townhouse': 'TH', 'Condominium': 'Condo', 'Duplex': 'Duplex', 'Multi-Family': 'MF' }
  for (const [match, tag] of Object.entries(typeMap)) {
    if (pt.includes(match)) { parts.push(tag); break }
  }
  if (lead.beds && lead.baths) parts.push(`${lead.beds}bd/${lead.baths}ba`)
  if (lead.sqft) parts.push(`${lead.sqft.toLocaleString()}sf`)
  if (lead.mlsDate) parts.push(`Exp ${lead.mlsDate}`)
  if (lead.ltv === 0) parts.push('FREE & CLEAR')
  return parts.join(' · ')
}
