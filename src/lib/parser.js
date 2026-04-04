import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { scoreLead, buildIntel } from './scoring'

function parseVal(v) {
  return v != null && v !== '' && !isNaN(v) ? Number(v) : null
}

function clean(v) {
  return v != null && v !== '' ? String(v).trim() : null
}

function normalize(addr) {
  return (addr || '').toString().trim().toLowerCase().replace(/\s+/g, ' ')
}

// Read an uploaded file (xlsx or csv) into an array of row objects
export function readFile(file) {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop().toLowerCase()

    if (ext === 'csv' || ext === 'tsv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (err) => reject(err),
      })
    } else {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
          resolve(rows)
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    }
  })
}

// Build contact lookup map from skip-traced contacts CSV
function buildContactMap(contactRows) {
  const map = {}

  contactRows.forEach((row) => {
    const addr = normalize(row['Street Address'] || '')
    if (!addr) return
    if (!map[addr]) map[addr] = { phones: [], emails: [], names: [] }
    const c = map[addr]

    // Names
    const fn = clean(row['First Name'])
    const ln = clean(row['Last Name'])
    const co = clean(row['Company Name'])
    if (fn || ln) c.names.push([fn, ln].filter(Boolean).join(' '))
    else if (co) c.names.push(co)

    // Phones (deduped)
    for (let i = 1; i <= 5; i++) {
      const ph = row[`Phone ${i}`]
      const pt = clean(row[`Phone ${i} Type`])
      const pd = clean(row[`Phone ${i} DNC`])
      if (ph != null && ph !== '') {
        const num = String(Math.floor(Number(ph)))
        if (num && num !== 'NaN' && !c.phones.find(p => p.num === num)) {
          c.phones.push({ num, type: pt || '', dnc: !!pd })
        }
      }
    }

    // Emails (deduped)
    for (let i = 1; i <= 4; i++) {
      const em = clean(row[`Email ${i}`])
      if (em && !c.emails.includes(em)) c.emails.push(em)
    }
  })

  // Sort phones: non-DNC cells first, then non-DNC landlines, then DNC
  Object.values(map).forEach((c) => {
    c.phones.sort((a, b) => {
      const dncDiff = (a.dnc ? 1 : 0) - (b.dnc ? 1 : 0)
      if (dncDiff !== 0) return dncDiff
      return (a.type === 'Cell' ? 0 : 1) - (b.type === 'Cell' ? 0 : 1)
    })
    c.names = [...new Set(c.names)]
  })

  return map
}

// Merge property rows with contact map, score, and return sorted leads
export function processFiles(propRows, contactRows) {
  const contactMap = buildContactMap(contactRows)

  const leads = propRows.map((row, idx) => {
    const addr = normalize(row['Address'] || '')
    const contact = contactMap[addr] || { phones: [], emails: [], names: [] }

    const mlsDateRaw = clean(row['MLS Date'])
    const mlsDate = mlsDateRaw ? mlsDateRaw.substring(0, 10) : null

    const lead = {
      id: idx,
      address: clean(row['Address']) || '',
      unit: clean(row['Unit #']),
      city: clean(row['City']) || '',
      state: clean(row['State']) || 'FL',
      zip: clean(row['Zip']) || '',
      ownerOcc: clean(row['Owner Occupied']),
      ownerFirst: clean(row['Owner 1 First Name']),
      ownerLast: clean(row['Owner 1 Last Name']),
      propType: clean(row['Property Type']) || '',
      beds: parseVal(row['Bedrooms']),
      baths: parseVal(row['Total Bathrooms']),
      sqft: parseVal(row['Building Sqft']),
      lotSqft: parseVal(row['Lot Size Sqft']),
      yearBuilt: parseVal(row['Effective Year Built']),
      mlsAmount: parseVal(row['MLS Amount']),
      estValue: parseVal(row['Est. Value']),
      equity: parseVal(row['Est. Equity']),
      ltv: parseVal(row['Est. Loan-to-Value']),
      assessedValue: parseVal(row['Total Assessed Value']),
      lastSaleAmount: parseVal(row['Last Sale Amount']),
      lastSaleDate: clean(row['Last Sale Recording Date']),
      openLoans: parseVal(row['Total Open Loans']),
      remainingBalance: parseVal(row['Est. Remaining balance of Open Loans']),
      mlsDate,
      mlsStatus: clean(row['MLS Status']),
      contactNames: contact.names.slice(0, 3).join(' | '),
      phones: contact.phones.slice(0, 5),
      emails: contact.emails.slice(0, 3),
      callablePhones: contact.phones.filter(p => !p.dnc).length,
      totalPhones: contact.phones.length,
      hasEmail: contact.emails.length > 0,
    }

    const { score, tier, notes } = scoreLead(lead)
    const intel = buildIntel(lead)

    return { ...lead, score, tier, notes, intel }
  })

  return leads.sort((a, b) => b.score - a.score)
}
