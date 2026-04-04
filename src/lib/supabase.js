import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('Supabase credentials not found. Running in local-only mode.')
}

export const supabase = url && key ? createClient(url, key) : null

// Insert a new list and return its ID
export async function createList(name, market) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('lists')
    .insert({ name, market })
    .select('id')
    .single()
  if (error) { console.error('createList error:', error); return null }
  return data.id
}

// Batch insert leads (chunks of 200 to stay under payload limits)
export async function insertLeads(listId, leads) {
  if (!supabase) return false
  const rows = leads.map(l => ({
    list_id: listId,
    address: l.address,
    unit: l.unit || null,
    city: l.city,
    state: l.state || 'FL',
    zip: l.zip,
    property_type: l.propType,
    beds: l.beds,
    baths: l.baths,
    sqft: l.sqft,
    owner_occupied: l.ownerOcc === 'Yes',
    owner_first: l.ownerFirst,
    owner_last: l.ownerLast,
    mls_amount: l.mlsAmount,
    mls_date: l.mlsDate || null,
    mls_status: l.mlsStatus,
    est_value: l.estValue,
    est_equity: l.equity,
    ltv: l.ltv,
    assessed_value: l.assessedValue,
    last_sale_amount: l.lastSaleAmount,
    open_loans: l.openLoans,
    remaining_balance: l.remainingBalance,
    contact_names: l.contactNames,
    phone_1: l.phones?.[0]?.num || null,
    phone_1_type: l.phones?.[0]?.type || null,
    phone_1_dnc: l.phones?.[0]?.dnc || false,
    phone_2: l.phones?.[1]?.num || null,
    phone_2_type: l.phones?.[1]?.type || null,
    phone_2_dnc: l.phones?.[1]?.dnc || false,
    phone_3: l.phones?.[2]?.num || null,
    phone_3_type: l.phones?.[2]?.type || null,
    phone_3_dnc: l.phones?.[2]?.dnc || false,
    phone_4: l.phones?.[3]?.num || null,
    phone_4_type: l.phones?.[3]?.type || null,
    phone_4_dnc: l.phones?.[3]?.dnc || false,
    phone_5: l.phones?.[4]?.num || null,
    phone_5_type: l.phones?.[4]?.type || null,
    phone_5_dnc: l.phones?.[4]?.dnc || false,
    email_1: l.emails?.[0] || null,
    email_2: l.emails?.[1] || null,
    email_3: l.emails?.[2] || null,
    callable_phones: l.callablePhones,
    total_phones: l.totalPhones,
    score: l.score,
    tier: l.tier,
    score_notes: l.notes,
    intel: l.intel,
    call_status: 'not_called',
  }))

  const chunkSize = 200
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from('leads').insert(chunk)
    if (error) { console.error('insertLeads error at chunk', i, error); return false }
  }
  // Update list stats
  const callable = leads.filter(l => l.callablePhones > 0).length
  const avgScore = Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length)
  await supabase.from('lists').update({
    total_leads: leads.length,
    callable_leads: callable,
    avg_score: avgScore,
  }).eq('id', listId)
  return true
}

// Load leads for a list
export async function loadLeads(listId) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('list_id', listId)
    .order('score', { ascending: false })
  if (error) { console.error('loadLeads error:', error); return [] }
  return data
}

// Load all lists
export async function loadLists() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) { console.error('loadLists error:', error); return [] }
  return data
}

// Update lead call status
export async function updateLeadStatus(leadId, status, notes, followUpDate) {
  if (!supabase) return false
  const { error } = await supabase
    .from('leads')
    .update({ call_status: status, call_notes: notes, follow_up_date: followUpDate || null })
    .eq('id', leadId)
  if (error) { console.error('updateLeadStatus error:', error); return false }
  return true
}
