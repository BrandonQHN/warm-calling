// Mass Import Users for Lead Intel
// ──────────────────────────────────
// 1. Add your student emails below
// 2. Run: node import-users.mjs
//
// Requires your Supabase URL and SERVICE ROLE key (not anon key).
// Find the service role key in: Supabase > Settings > API > service_role (secret)

const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co'   // <-- change this
const SERVICE_ROLE_KEY = 'eyJ...'                          // <-- change this (service_role key, NOT anon)

// Add student emails here. Each one gets the same default password.
// Tell them to let you know if they need a password reset.
const DEFAULT_PASSWORD = 'CallsIntoListings2026'

const STUDENTS = [
  'student1@example.com',
  'student2@example.com',
  'student3@example.com',
  // add as many as you need
]

// ── Don't edit below this line ──

async function createUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
    }),
  })
  const data = await res.json()
  if (!res.ok) return { email, ok: false, error: data.msg || data.message || JSON.stringify(data) }
  return { email, ok: true, id: data.id }
}

async function main() {
  console.log(`\nCreating ${STUDENTS.length} accounts...\n`)
  console.log(`Default password: ${DEFAULT_PASSWORD}\n`)

  let success = 0, failed = 0

  for (const email of STUDENTS) {
    const result = await createUser(email, DEFAULT_PASSWORD)
    if (result.ok) {
      console.log(`  OK  ${email}`)
      success++
    } else {
      console.log(`  FAIL  ${email}  (${result.error})`)
      failed++
    }
  }

  console.log(`\nDone. ${success} created, ${failed} failed.\n`)
  if (success > 0) {
    console.log(`Students can log in at your Lead Intel URL with:`)
    console.log(`  Email: their email from the list above`)
    console.log(`  Password: ${DEFAULT_PASSWORD}`)
  }
}

main()
