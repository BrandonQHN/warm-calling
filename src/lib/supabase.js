import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && key ? createClient(url, key) : null

// Auth (login only, no signup)
export async function signIn(email, password) {
  if (!supabase) return { error: 'Platform not configured. Contact your admin.' }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error: error?.message }
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut()
}

export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data?.session || null
}

export function onAuthChange(cb) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_ev, session) => cb(session))
  return data.subscription.unsubscribe
}

// Lists
export async function loadLists() {
  if (!supabase) return []
  const { data, error } = await supabase.from('lists')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) { console.error('loadLists:', error); return [] }
  return data || []
}

export async function createList(name) {
  if (!supabase) return null
  const session = await getSession()
  if (!session) return null
  const { data, error } = await supabase.from('lists')
    .insert({ name, user_id: session.user.id })
    .select('id')
    .single()
  if (error) { console.error('createList:', error); return null }
  return data.id
}

export async function updateListStats(listId, stats) {
  if (!supabase) return
  await supabase.from('lists').update(stats).eq('id', listId)
}

export async function deleteList(listId) {
  if (!supabase) return false
  const { error } = await supabase.from('lists').delete().eq('id', listId)
  if (error) { console.error('deleteList:', error); return false }
  return true
}

// Leads
export async function insertLeads(listId, leads) {
  if (!supabase) return false
  const session = await getSession()
  if (!session) return false
  const uid = session.user.id

  const rows = leads.map(l => ({
    list_id: listId, user_id: uid,
    full_name: l.fullName, first_name: l.firstName, last_name: l.lastName, second_name: l.secondName,
    address: l.address, city: l.city, state: l.state, zip: l.zip,
    property_type: l.propType, beds: l.beds, baths: l.baths, sqft: l.sqft, year_built: l.yearBuilt,
    list_price: l.listPrice, days_on_market: l.daysOnMarket, listing_status: l.listingStatus,
    status_change_date: l.statusChangeDate, list_date: l.listDate,
    mls_id: l.mlsId, list_agent: l.listAgent, list_office: l.listOffice,
    subdivision: l.subdivision, tax_owner_name: l.taxOwnerName, county: l.county,
    phone_1: l.phones?.[0]?.num, phone_1_type: l.phones?.[0]?.type,
    phone_2: l.phones?.[1]?.num, phone_2_type: l.phones?.[1]?.type,
    phone_3: l.phones?.[2]?.num, phone_3_type: l.phones?.[2]?.type,
    phone_4: l.phones?.[3]?.num, phone_4_type: l.phones?.[3]?.type,
    phone_5: l.phones?.[4]?.num, phone_5_type: l.phones?.[4]?.type,
    email_1: l.emails?.[0] || null,
    callable_phones: l.callablePhones, total_phones: l.totalPhones, has_email: l.hasEmail,
    score: l.score, tier: l.tier, score_notes: l.scoreNotes, intel: l.intel,
    call_status: 'not_called',
  }))

  const chunk = 200
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabase.from('leads').insert(rows.slice(i, i + chunk))
    if (error) { console.error('insertLeads chunk:', error); return false }
  }

  await updateListStats(listId, {
    total_leads: leads.length,
    callable_leads: leads.filter(l => l.callablePhones > 0).length,
    with_email: leads.filter(l => l.hasEmail).length,
    avg_score: leads.length ? Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length) : 0,
  })
  return true
}

export async function loadLeads(listId) {
  if (!supabase) return []
  const { data, error } = await supabase.from('leads')
    .select('*')
    .eq('list_id', listId)
    .order('score', { ascending: false })
  if (error) { console.error('loadLeads:', error); return [] }
  // Reconstruct lead objects from DB rows
  return (data || []).map(r => ({
    id: r.id, fullName: r.full_name || '', firstName: r.first_name || '', lastName: r.last_name || '',
    secondName: r.second_name, address: r.address, city: r.city, state: r.state, zip: r.zip,
    propType: r.property_type || '', beds: r.beds, baths: r.baths, sqft: r.sqft, yearBuilt: r.year_built,
    listPrice: r.list_price ? Number(r.list_price) : null,
    daysOnMarket: r.days_on_market, listingStatus: r.listing_status,
    statusChangeDate: r.status_change_date, listDate: r.list_date,
    mlsId: r.mls_id, listAgent: r.list_agent, listOffice: r.list_office,
    subdivision: r.subdivision, taxOwnerName: r.tax_owner_name, county: r.county,
    phones: [
      r.phone_1 && { num: r.phone_1, type: r.phone_1_type || 'Phone' },
      r.phone_2 && { num: r.phone_2, type: r.phone_2_type || 'Phone' },
      r.phone_3 && { num: r.phone_3, type: r.phone_3_type || 'Phone' },
      r.phone_4 && { num: r.phone_4, type: r.phone_4_type || 'Phone' },
      r.phone_5 && { num: r.phone_5, type: r.phone_5_type || 'Phone' },
    ].filter(Boolean),
    emails: [r.email_1].filter(Boolean),
    callablePhones: r.callable_phones || 0, totalPhones: r.total_phones || 0,
    hasEmail: r.has_email || false,
    score: r.score || 0, tier: r.tier || 'D - Low', scoreNotes: r.score_notes || '', intel: r.intel || '',
  }))
}
