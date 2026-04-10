import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { scoreLead, buildIntel } from './scoring'

function num(v) { return v != null && v !== '' && !isNaN(v) ? Number(v) : null }
function str(v) { return v != null && v !== '' ? String(v).trim() : null }
function phone(v) {
  if (v == null || v === '') return null
  const n = String(v).replace(/[^0-9]/g, '')
  return n.length >= 7 ? n : null
}
function daysAgo(d) { try { const t = new Date(d); return isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 864e5)) } catch { return null } }
function fmtDate(d) { try { const t = new Date(d); return isNaN(t) ? null : t.toISOString().slice(0, 10) } catch { return null } }

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext === 'csv' || ext === 'tsv') {
      Papa.parse(file, { header: true, skipEmptyLines: true, complete: r => resolve(r.data), error: reject })
    } else {
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
          if (!wb.SheetNames.length) return reject(new Error('The file has no sheets.'))
          resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }))
        } catch (err) { reject(new Error('Could not read this file. Make sure it is a valid .xlsx or .csv export from Mojo.')) }
      }
      reader.onerror = () => reject(new Error('Failed to read the file. Please try again.'))
      reader.readAsArrayBuffer(file)
    }
  })
}

// Validate that the file has the expected Mojo columns
function validateColumns(rows) {
  if (!rows.length) throw new Error('The file is empty. Export your leads from Mojo and try again.')
  const cols = Object.keys(rows[0])
  const required = ['Property Address']
  const missing = required.filter(c => !cols.includes(c))
  if (missing.length) {
    throw new Error(`This file is missing the "Property Address" column. Make sure you are uploading a Mojo lead export (.xlsx or .csv).`)
  }
}

export function processLeads(rows) {
  validateColumns(rows)
  return rows.map((row, idx) => {
    const phones = [], seen = new Set()
    const add = (v, type) => { const n = phone(v); if (n && !seen.has(n)) { seen.add(n); phones.push({ num: n, type }) } }
    add(row['Primary Phone'], str(row['Primary Phone Label']) || 'Primary')
    for (let i = 1; i <= 10; i++) {
      add(row[`Phone ${i}`], str(row[`Phone ${i} Label`]) || 'Phone')
      add(row[`Mobile ${i}`], str(row[`Mobile ${i} Label`]) || 'Mobile')
    }
    const emails = []; const e1 = str(row['Email 1']); if (e1) emails.push(e1)
    const lead = {
      id: idx, fullName: str(row['Full Name']) || '', firstName: str(row['First Name']) || '', lastName: str(row['Last Name']) || '',
      secondName: str(row['Second Name']) || '', address: str(row['Property Address']) || '', city: str(row['Property City']) || '',
      state: str(row['Property State']) || '', zip: str(row['Property Zip Code']) || '', propType: str(row['Property Type']) || '',
      beds: num(row['Bedrooms']), baths: num(row['Bathrooms']), sqft: num(row['Square Footage']), yearBuilt: num(row['Year Built']),
      county: str(row['County']), listPrice: num(row['List Price']), daysOnMarket: num(row['Days On Market']),
      listingStatus: str(row['Listing Status']), statusChangeDate: fmtDate(row['Status Change Date']),
      daysSinceExpired: daysAgo(row['Status Change Date']), listDate: fmtDate(row['List Date']), mlsId: str(row['MLS ID']),
      listAgent: str(row['List Agent']), listOffice: str(row['List Office']), subdivision: str(row['Subdivision']),
      taxOwnerName: str(row['Tax Owner Name']), phones: phones.slice(0, 5), emails, callablePhones: phones.length,
      totalPhones: phones.length, hasEmail: emails.length > 0, callAttempts: num(row['Call Attempts']) || 0,
      lastCallResult: str(row['Last Call Result']), source: str(row['Source']), leadId: str(row['Lead ID/Contact ID']),
    }
    const { score, tier, notes } = scoreLead(lead)
    return { ...lead, score, tier, scoreNotes: notes, intel: buildIntel(lead) }
  }).sort((a, b) => b.score - a.score)
}
