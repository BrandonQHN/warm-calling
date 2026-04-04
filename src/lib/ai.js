// Claude API interactions for lead outreach generation
// Calls /api/claude (Netlify Function) so the API key stays server-side

const MAX_RETRIES = 2
const RETRY_BASE_MS = 1500
const BATCH_CONCURRENCY = 3

function buildContext(lead) {
  const name = lead.ownerFirst || lead.contactNames?.split('|')[0]?.trim()?.split(' ')[0] || 'Homeowner'
  const full = lead.contactNames?.split('|')[0]?.trim() || name
  const prop = `${lead.propType || 'property'} at ${lead.address}, ${lead.city}`
  const eq = lead.equity
    ? (lead.equity < 0 ? 'negative (underwater)' : `$${lead.equity.toLocaleString()}`)
    : 'unknown'
  const listed = lead.mlsAmount
    ? (lead.mlsAmount > 1000 ? `$${lead.mlsAmount.toLocaleString()}` : `$${lead.mlsAmount}/mo`)
    : 'unknown'
  const expired = lead.mlsDate || 'recently'
  const occ = lead.ownerOcc === 'Yes' ? 'owner-occupied' : 'absentee owner'
  const free = lead.ltv === 0 ? 'Property is FREE AND CLEAR.' : ''
  return { name, full, prop, eq, listed, expired, occ, free }
}

const TOKEN_LIMITS = { email: 800, script: 1200 }

const PROMPTS = {
  email: (c) => `Write a short outreach email (4 to 5 sentences) from a real estate agent to an expired listing homeowner.

Owner: ${c.full}
Property: ${c.prop}
Listed at: ${c.listed}
Equity: ${c.eq}
Status: ${c.occ}
Expired: ${c.expired}
${c.free}

Rules: Reference their specific property and situation. Empathetic but direct. No filler like "I hope this finds you well." Hit the pain point (listing expired, they still want to sell, bad experience). Not pushy. End with a CTA to have a quick conversation. No emojis, no exclamation marks, no dashes. Just the email body, no subject line. 6th grade reading level.`,

  script: (c) => `Write a cold call opener script for a real estate agent calling an expired listing.

Owner: ${c.full}
Property: ${c.prop}
Listed at: ${c.listed}
Equity: ${c.eq}
Status: ${c.occ}
Expired: ${c.expired}
${c.free}

Format it exactly like this:

OPENER: (2 sentences. Use their name. Reference the property. Get to the point.)
BRIDGE: (1 sentence. Why you are calling.)
HOOK QUESTION: (1 open ended question to get them talking about their experience.)
IF "I already have an agent": (1 to 2 sentence response)
IF "I'm not interested": (1 to 2 sentence response)
CLOSE: (1 to 2 sentences. Book the meeting, not sell the listing.)

Rules: Total under 150 words. Conversational. Not robotic. Never say "how are you doing today." No emojis, no dashes. No filler like "I completely understand." 6th grade reading level.`,
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function callClaude(prompt, type = 'email') {
  const maxTokens = TOKEN_LIMITS[type] || 800
  let lastErr = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1))
    }

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      // Retry on 429 (rate limit) and 529 (overloaded)
      if (res.status === 429 || res.status === 529) {
        lastErr = new Error(`API returned ${res.status}`)
        continue
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message || err.error || `API returned ${res.status}`)
      }

      const data = await res.json()

      // Check for API-level errors in response body
      if (data.type === 'error') {
        const msg = data.error?.message || 'Unknown API error'
        // Retry on overload errors
        if (msg.includes('overloaded')) { lastErr = new Error(msg); continue }
        throw new Error(msg)
      }

      return data.content?.map(b => b.text || '').join('\n') || 'Error: empty response'
    } catch (e) {
      lastErr = e
      // Only retry on network errors, not on validation errors
      if (e.name === 'TypeError' && e.message.includes('fetch')) continue
      if (attempt === MAX_RETRIES) throw e
    }
  }

  throw lastErr || new Error('Max retries exceeded')
}

export async function generateForLead(lead, type) {
  const ctx = buildContext(lead)
  const prompt = PROMPTS[type](ctx)
  return callClaude(prompt, type)
}

// Batch generate emails with parallel concurrency
export async function batchGenerateEmails(leads, onProgress, cancelRef) {
  const emailLeads = leads.filter(l => l.hasEmail && l.emails?.length > 0)
  if (emailLeads.length === 0) return []

  const results = new Array(emailLeads.length).fill(null)
  let completedCount = 0

  // Process in chunks of BATCH_CONCURRENCY
  for (let i = 0; i < emailLeads.length; i += BATCH_CONCURRENCY) {
    if (cancelRef?.current) break

    const chunk = emailLeads.slice(i, i + BATCH_CONCURRENCY)
    const promises = chunk.map(async (l, chunkIdx) => {
      const idx = i + chunkIdx
      if (cancelRef?.current) return

      const ctx = buildContext(l)
      const prompt = PROMPTS.email(ctx)
      const firstName = ctx.full.split(' ')[0] || ''
      const lastName = ctx.full.split(' ').slice(1).join(' ') || ''
      const base = {
        email: l.emails[0],
        first_name: firstName,
        last_name: lastName,
        address: l.address,
        city: l.city,
        state: l.state || 'FL',
        tier: l.tier,
        score: l.score,
      }

      try {
        const body = await callClaude(prompt, 'email')
        results[idx] = { ...base, custom_email_body: body }
      } catch (e) {
        results[idx] = { ...base, custom_email_body: `[Failed: ${e.message}]` }
      }
    })

    await Promise.all(promises)
    completedCount = Math.min(i + BATCH_CONCURRENCY, emailLeads.length)
    onProgress?.(completedCount, emailLeads.length)
  }

  return results.filter(Boolean)
}
