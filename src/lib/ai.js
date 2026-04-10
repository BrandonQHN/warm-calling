const RETRIES = 2, DELAY = 1500, BATCH = 3, TOK = { email: 800, script: 1800 }

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
  email: c => `You are writing a short outreach email (4 to 5 sentences) from a real estate agent to a homeowner whose listing just expired. The agent is confident, direct, and experienced. This is not a mass template. It should read like one specific person writing to another specific person.

Owner name: ${c.full}
Property: ${c.type} at ${c.prop}
Was listed at: ${c.listed}
Sat on the market for: ${c.dom}
Listing expired: ${c.expired}
${c.prev}

Rules:
- Open by referencing their specific property address and situation. No generic "I noticed your listing expired" openers. Be specific about their property
- Acknowledge the frustration of sitting on the market for ${c.dom} without being patronizing
- Position yourself as someone who can diagnose what went wrong and fix it, not as someone begging for a chance
- End with a low-pressure ask: a quick phone call or a 10-minute meeting. Not "I'd love the opportunity to..." Just ask directly
- No emojis, no exclamation marks, no dashes of any kind
- No filler phrases: no "I hope this finds you well," no "I wanted to reach out," no "I'd love to connect"
- Just the email body, no subject line, no sign-off name
- 6th grade reading level
- Tone: like a text from someone who knows what they are doing, not a form letter`,

  script: c => `You are writing a cold call script for an experienced real estate agent calling a homeowner whose expired listing just came off the market. The agent has made thousands of calls. They are confident, slightly funny, self-aware about the fact that the seller is getting bombarded by agents, and never sound desperate or robotic.

Owner name: ${c.full}
Property: ${c.type} at ${c.prop}
Was listed at: ${c.listed}
Days on market: ${c.dom}
Listing expired: ${c.expired}
${c.prev}

Write the script in this exact format:

OPENER:
Write 2 to 3 sentences. Use their first name naturally. Acknowledge right away that they are getting a ton of calls and you know it. Use a quick self-aware line to break the pattern, something like acknowledging you are "call number 15 today" or that they "became famous overnight." Then immediately pivot to why you are worth 30 seconds of their time. Do NOT open with "how are you" or "is this a good time" or "I saw your listing expired." Sound like a human, not a script.

BRIDGE:
One sentence. Say something that shows you already looked at their property and know the situation. Reference the days on market or the price or the previous agent. This proves you did your homework and are not just dialing blind.

QUESTION:
One open-ended question designed to get them talking about what went wrong. The goal is to get them venting. When they vent, they are engaged. When they are engaged, you can help. Do not ask "why do you think it didn't sell." Ask something that lets them tell their story.

WHEN THEY SAY "I already have an agent lined up":
Write a 1 to 2 sentence response. Do not back down. Use the "second opinion" angle: "Don't you think you owe it to yourself to hear one more perspective before you sign another contract?" Position it as protecting their interest, not competing with the other agent.

WHEN THEY SAY "I'm not interested":
Write a 1 to 2 sentence response. Do not beg. Use a confident reframe. Something like: "That's fair. Interest is usually based on what someone can do for you, and you haven't heard what I bring to the table yet." Or use a takeaway: "I'm not even sure I can help you, but I'd like 10 minutes to find out." Match their energy without being aggressive.

WHEN THEY GET HOSTILE OR ANNOYED:
Write a 2 to 3 sentence response for when the seller is pissed off, swearing, or telling you to stop calling. Stay calm. Acknowledge their frustration genuinely. Say something like: "I hear you, and I'm not trying to add to the noise. I know every agent and their mother has been calling you. The only reason I'm still on this call is because I looked at your property and I actually think it should have sold." Then pivot back to the question or the meeting ask.

CLOSE:
1 to 2 sentences. Book a 10 to 15 minute meeting. Not a listing presentation. Not a sales pitch. Just 10 minutes to show them what you would do differently. Use something like: "There are 1,440 minutes in a day. I'm asking for 10. If I can't show you something different in that time, I'll never call you again." Do not sell the listing on the phone. The only goal is the meeting.

Rules:
- Under 250 words total
- This should sound like a real person who has done this 10,000 times, not a first-year agent reading a script
- Vary the language. Do not repeat the same phrases across different leads
- No emojis, no dashes of any kind
- Never use: "I completely understand," "that makes total sense," "I appreciate your time," "I totally get that," "absolutely," or any other corporate filler
- Never open with "how are you" or "is this a good time"
- 6th grade reading level
- The tone is: confident, direct, slightly funny, never desperate, never begging`
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
