// All Claude API interactions for lead outreach generation

function buildContext(lead) {
  const name = lead.ownerFirst || lead.contactNames?.split('|')[0]?.trim()?.split(' ')[0] || 'Homeowner'
  const full = lead.contactNames?.split('|')[0]?.trim() || name
  const prop = `${lead.propType || 'property'} at ${lead.address}, ${lead.city}`
  const eq = lead.equity ? `$${lead.equity.toLocaleString()}` : 'unknown'
  const listed = lead.mlsAmount
    ? (lead.mlsAmount > 1000 ? `$${lead.mlsAmount.toLocaleString()}` : `$${lead.mlsAmount}/mo`)
    : 'unknown'
  const expired = lead.mlsDate || 'recently'
  const occ = lead.ownerOcc === 'Yes' ? 'owner-occupied' : 'absentee owner'
  const free = lead.ltv === 0 ? 'Property is FREE AND CLEAR.' : ''
  return { name, full, prop, eq, listed, expired, occ, free }
}

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

  text: (c) => `Write a follow-up text (2 to 3 sentences) from a real estate agent after a missed cold call to an expired listing owner.

Owner first name: ${c.name}
Property: ${c.prop}
Status: ${c.occ}

Rules: Casual and direct. Mention the property address specifically. Include a soft question to prompt a reply. No emojis, no exclamation marks, no dashes. Sound human, not like a template. 6th grade reading level.`,

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

async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  return data.content?.map(b => b.text || '').join('\n') || 'Error generating content.'
}

// Generate a single piece of content for one lead
export async function generateForLead(lead, type) {
  const ctx = buildContext(lead)
  const prompt = PROMPTS[type](ctx)
  return callClaude(prompt)
}

// Batch generate emails for all leads with email addresses
// onProgress(done, total) called after each lead
// cancelRef.current = true to stop
export async function batchGenerateEmails(leads, onProgress, cancelRef) {
  const emailLeads = leads.filter(l => l.hasEmail && l.emails?.length > 0)
  const results = []

  for (let i = 0; i < emailLeads.length; i++) {
    if (cancelRef?.current) break

    const l = emailLeads[i]
    const ctx = buildContext(l)
    const prompt = PROMPTS.email(ctx)

    try {
      const body = await callClaude(prompt)
      const firstName = ctx.full.split(' ')[0] || ''
      const lastName = ctx.full.split(' ').slice(1).join(' ') || ''
      results.push({
        email: l.emails[0],
        first_name: firstName,
        last_name: lastName,
        address: l.address,
        city: l.city,
        state: l.state || 'FL',
        tier: l.tier,
        score: l.score,
        custom_email_body: body,
      })
    } catch (e) {
      results.push({
        email: l.emails[0],
        first_name: ctx.name,
        last_name: '',
        address: l.address,
        city: l.city,
        state: l.state || 'FL',
        tier: l.tier,
        score: l.score,
        custom_email_body: '[Generation failed]',
      })
    }

    onProgress?.(i + 1, emailLeads.length)
  }

  return results
}
