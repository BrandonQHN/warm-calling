# Lead Intel

AI-powered lead scoring, ranking, and outreach tool for expired listings.

## Setup (5 minutes)

### Step 1: GitHub

Create a new repo on GitHub. Push this project:

```bash
cd lead-intel
git init
git add .
git commit -m "initial"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/lead-intel.git
git push -u origin main
```

### Step 2: Supabase

1. Go to https://supabase.com and create a new project
2. Once the project is ready, go to SQL Editor
3. Paste the contents of `supabase/schema.sql` and run it
4. Go to Settings > API and copy:
   - Project URL (looks like `https://xxxxx.supabase.co`)
   - Anon public key (starts with `eyJ...`)

### Step 3: Netlify

1. Go to https://app.netlify.com and click "Add new site" > "Import an existing project"
2. Connect your GitHub repo
3. Build settings (should auto-detect):
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Go to Site settings > Environment variables and add:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
5. Trigger a redeploy after adding env vars

That's it. The site is live.

### Local dev (optional)

```bash
npm install
cp .env.example .env
# Edit .env with your Supabase credentials
npm run dev
```

## How it works

### Upload
- Property Export (.xlsx or .csv from PropStream)
- Skip Traced Contacts (.csv with phone numbers and emails)

### Scoring (0 to 100)
| Factor | Max Pts | Logic |
|--------|---------|-------|
| Equity | 25 | $500K+ = 25, $250K+ = 20, $100K+ = 15 |
| Owner Occupied | 15 | Owner-occ = 15, Absentee = 8 |
| Property Type | 20 | SFR = 20, TH = 18, MF = 17, Condo = 10 |
| Contactability | 20 | 3+ callable = 20, 2 = 15, 1 = 10 |
| Price Gap | 10 | Overpriced 15%+ = 10 |
| Has Email | 5 | Follow-up channel |
| Free & Clear | 5 | No mortgage |

### Tiers
- A Hot (76 to 100): Call first, multiple attempts
- B High (61 to 75): Second wave
- C Medium (41 to 60): Third wave
- D Low (0 to 40): Email/text only

### Exports
- **Ranked XLSX**: Full scored sheet with pre-call intel
- **Mojo CSV**: DNC-filtered, sorted by score, Mojo Dialer format
- **Email Campaign CSV**: AI-generated personalized emails for every lead with an email address, formatted for Instantly import

### Per-lead AI generation
Click any lead and generate:
- Personalized outreach email (references their property, equity, situation)
- Follow-up text (for after missed call/voicemail)
- Cold call opener script (with objection handlers)

### Batch email campaign
Hit "Generate Email Campaign" in the nav. It runs Claude against every lead with an email and exports a CSV with columns: email, first_name, last_name, address, city, state, tier, score, custom_email_body. Upload into Instantly as a campaign.

## Stack
- React 18, Vite 5
- Supabase (Postgres, optional persistence)
- SheetJS (xlsx/csv parsing and export)
- PapaParse (csv parsing)
- Recharts (charts)
- Lucide React (icons)
- Claude API (AI generation, runs client-side from the artifact)
- Netlify (hosting)

## File structure
```
src/
  App.jsx           Main UI
  main.jsx          Entry point
  lib/
    ai.js           Claude API calls (single + batch)
    exporter.js     XLSX, Mojo CSV, Email Campaign CSV exports
    parser.js       File reading, property + contact merging
    scoring.js      Lead scoring engine
    supabase.js     Database client
  styles/
    index.css       All styles
supabase/
  schema.sql        Database schema (run in Supabase SQL editor)
```
