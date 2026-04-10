const RETRIES = 2, DELAY = 1500, BATCH = 3, TOK = { email: 800, script: 1200 }

function ctx(l) {
  const name = l.firstName || l.fullName?.split(' ')[0] || 'Homeowner'
  const full = l.fullName || name
  return { name, full, prop: `${l.address}, ${l.city}`, type: l.propType || 'property',
    listed: l.listPrice ? `$${l.listPrice.toLocaleString()}` : 'an unlisted price',
    dom: l.daysOnMarket ? `${l.daysOnMarket} days` : 'some time',
    expired: l.statusChangeDate || 'recently',
    prev: l.listAgent ? `Previously listed with ${l.listAgent}${l.listOffice ? ` at ${l.listOffice}` : ''}.` : '' }
}

const P = {
  email: c => `Write a short outreach email (4 to 5 sentences) from a real estate agent to a homeowner whose listing just expired.

Owner name: ${c.full}
Property: ${c.type} at ${c.prop}
Was listed at: ${c.listed}
Sat on the market for: ${c.dom}
Listing expired: ${c.expired}
${c.prev}

Rules:
- Mention their property address and how long it sat on the market
- Be empathetic about the experience but direct about why you are reaching out
- Do not use filler phrases like "I hope this finds you well"
- End with a simple ask to have a brief phone conversation
- No emojis, no exclamation marks, no dashes of any kind
- Just the email body, no subject line or sign-off name
- Keep it at a 6th grade reading level`,

  script: c => `Write a cold call opener script for a real estate agent calling a homeowner whose listing just expired.

Owner name: ${c.full}
Property: ${c.type} at ${c.prop}
Was listed at: ${c.listed}
Days on market: ${c.dom}
Listing expired: ${c.expired}
${c.prev}

Format:
OPENER: (2 sentences. Use their first name. Reference the property address.)
BRIDGE: (1 sentence. Why you are calling.)
QUESTION: (1 open-ended question to get them talking about what went wrong.)
IF "I already have an agent": (1 to 2 sentence response.)
IF "I'm not interested": (1 to 2 sentence response.)
CLOSE: (1 to 2 sentences. Book a 15-minute meeting. Do not try to sell the listing on the phone.)

Rules:
- Under 150 words total
- Conversational and natural
- Never open with "how are you doing" or "how are you today"
- No emojis, no dashes of any kind
- No filler phrases like "I completely understand" or "that makes total sense"
- 6th grade reading level`
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function call(prompt, type = 'email') {
  let err
  for (let i = 0; i <= RETRIES; i++) {
    if (i) await sleep(DELAY * 2 ** (i - 1))
    try {
      const r = await fetch('/api/claude', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: TOK[type] || 800, messages: [{ role: 'user', content: prompt }] }) })
      if (r.status === 429 || r.status === 529) { err = new Error(`Rate limited`); continue }
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || e.error || `Error ${r.status}`) }
      const d = await r.json()
      if (d.type === 'error') { const m = d.error?.message || 'API error'; if (m.includes('overloaded')) { err = new Error(m); continue }; throw new Error(m) }
      return d.content?.map(b => b.text || '').join('\n') || 'Empty response.'
    } catch (e) { err = e; if (i === RETRIES) throw e }
  }
  throw err
}

export async function generateForLead(lead, type) { return call(P[type](ctx(lead)), type) }

export async function batchGenerateEmails(leads, onProgress, cancelRef) {
  const el = leads.filter(l => l.hasEmail && l.emails?.length > 0)
  if (!el.length) return []
  const res = Array(el.length).fill(null)
  for (let i = 0; i < el.length; i += BATCH) {
    if (cancelRef?.current) break
    await Promise.all(el.slice(i, i + BATCH).map(async (l, ci) => {
      if (cancelRef?.current) return
      const c = ctx(l), base = { email: l.emails[0], first_name: l.firstName || c.name, last_name: l.lastName || '', address: l.address, city: l.city, state: l.state, tier: l.tier, score: l.score }
      try { res[i + ci] = { ...base, custom_email_body: await call(P.email(c), 'email') } }
      catch { res[i + ci] = { ...base, custom_email_body: '[Generation failed]' } }
    }))
    onProgress?.(Math.min(i + BATCH, el.length), el.length)
  }
  return res.filter(Boolean)
}
