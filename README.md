# Lead Intel

AI-powered lead scoring platform for expired listings. Students upload their Mojo export, get every lead scored and ranked, then generate personalized emails and call scripts.

## Setup

### 1. Supabase
1. Create a project at supabase.com
2. Go to SQL Editor, paste `supabase/schema.sql`, run it
3. Go to Authentication > Settings > turn OFF "Enable Sign Up" (you control who gets an account)
4. Copy your Project URL and anon key from Settings > API

### 2. Create Student Accounts
In the Supabase SQL Editor, run this for each student (change the email and password):

```sql
select auth.create_user('{
  "email": "student@example.com",
  "password": "their-password",
  "email_confirm": true
}'::jsonb);
```

### 3. GitHub + Netlify
Push to GitHub, import in Netlify, add env vars:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`

Redeploy.

## Admin SQL Helpers

View all students:
```sql
select u.email, count(distinct l.id) as lists, coalesce(sum(l.total_leads),0) as leads
from auth.users u left join lists l on l.user_id = u.id
group by u.id, u.email order by u.created_at desc;
```

Clear a student's data (keep account):
```sql
delete from lists where user_id = (select id from auth.users where email = 'student@example.com');
```

Delete a student entirely:
```sql
delete from auth.users where email = 'student@example.com';
```

## What Students See
1. Login with credentials you gave them
2. My Lists page (previous uploads, upload new, delete old)
3. Upload Mojo export (.xlsx or .csv)
4. Dashboard with stats, tier breakdown, charts
5. Call List sorted by score with search and tier filters
6. Click any lead for full details + AI outreach (email + call script)
7. Email Campaign button batch-generates emails for Instantly
8. Mojo CSV export re-imports ranked leads back into their dialer
9. Everything saves to their account and persists across sessions

## Persistence
Every upload is saved to the student's account. When they log back in, their previous lists are there. They can load any previous list or delete ones they no longer need. Each student's data is completely private via Row Level Security.

## Edge Cases Handled
- Wrong file format (not Mojo export) shows clear error
- Empty files show clear error
- Large files chunk into 200-row batches for Supabase
- API rate limits retry 2x with backoff
- Batch email with 0 email leads shows message
- No phone numbers still scores (just lower)
- Lost connection during save keeps leads in memory
- Multiple students uploading simultaneously (each isolated by user_id)

## Stack
React 18, Vite 5, Supabase (Postgres + Auth + RLS), Netlify Functions, Claude Sonnet, SheetJS, PapaParse, Recharts, Lucide React
