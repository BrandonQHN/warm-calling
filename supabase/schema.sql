-- Lead Intel Schema
-- Run this in your Supabase SQL editor

-- Lists table: each upload session
create table if not exists lists (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  market text,
  total_leads int default 0,
  callable_leads int default 0,
  avg_score numeric(5,1) default 0,
  created_at timestamptz default now()
);

-- Leads table: individual scored leads
create table if not exists leads (
  id uuid default gen_random_uuid() primary key,
  list_id uuid references lists(id) on delete cascade,
  
  -- Property data
  address text not null,
  unit text,
  city text,
  state text,
  zip text,
  property_type text,
  beds int,
  baths numeric(3,1),
  sqft int,
  lot_sqft int,
  year_built int,
  owner_occupied boolean default false,
  
  -- Owner
  owner_first text,
  owner_last text,
  owner2_first text,
  owner2_last text,
  
  -- Financials
  mls_amount numeric(12,2),
  mls_date date,
  mls_status text,
  est_value numeric(12,2),
  est_equity numeric(12,2),
  ltv numeric(5,4),
  assessed_value numeric(12,2),
  last_sale_amount numeric(12,2),
  last_sale_date date,
  open_loans int,
  remaining_balance numeric(12,2),
  
  -- Contact info (aggregated from skip trace)
  contact_names text,
  phone_1 text,
  phone_1_type text,
  phone_1_dnc boolean default false,
  phone_2 text,
  phone_2_type text,
  phone_2_dnc boolean default false,
  phone_3 text,
  phone_3_type text,
  phone_3_dnc boolean default false,
  phone_4 text,
  phone_4_type text,
  phone_4_dnc boolean default false,
  phone_5 text,
  phone_5_type text,
  phone_5_dnc boolean default false,
  email_1 text,
  email_2 text,
  email_3 text,
  callable_phones int default 0,
  total_phones int default 0,
  
  -- Scoring
  score int default 0,
  tier text, -- 'A - Hot', 'B - High', 'C - Medium', 'D - Low'
  score_notes text,
  intel text, -- pre-call one-liner
  
  -- Call tracking
  call_status text, -- 'not_called', 'called', 'voicemail', 'callback', 'appointment', 'not_interested', 'wrong_number'
  call_notes text,
  follow_up_date date,
  
  created_at timestamptz default now()
);

-- Indexes for fast filtering
create index if not exists idx_leads_list_id on leads(list_id);
create index if not exists idx_leads_tier on leads(tier);
create index if not exists idx_leads_score on leads(score desc);
create index if not exists idx_leads_call_status on leads(call_status);

-- RLS policies (adjust as needed for auth)
alter table lists enable row level security;
alter table leads enable row level security;

-- Open access for now (tighten with auth later)
create policy "Allow all on lists" on lists for all using (true) with check (true);
create policy "Allow all on leads" on leads for all using (true) with check (true);
