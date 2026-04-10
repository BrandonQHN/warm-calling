-- ============================================================
-- LEAD INTEL - PRODUCTION SCHEMA
-- ============================================================
-- Run this entire file in Supabase SQL Editor
--
-- IMPORTANT: After running this, go to:
--   Authentication > Settings > turn OFF "Enable Sign Up"
--   This prevents students from creating their own accounts.
--   You create accounts for them manually (see ADMIN section below).
-- ============================================================

-- Tables

create table if not exists lists (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  total_leads int default 0,
  callable_leads int default 0,
  with_email int default 0,
  avg_score numeric(5,1) default 0,
  created_at timestamptz default now()
);

create table if not exists leads (
  id uuid default gen_random_uuid() primary key,
  list_id uuid references lists(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  full_name text,
  first_name text,
  last_name text,
  second_name text,
  address text not null,
  city text,
  state text,
  zip text,
  property_type text,
  beds int,
  baths numeric(3,1),
  sqft int,
  year_built int,
  list_price numeric(12,2),
  days_on_market int,
  listing_status text,
  status_change_date text,
  list_date text,
  mls_id text,
  list_agent text,
  list_office text,
  subdivision text,
  tax_owner_name text,
  county text,
  phone_1 text,
  phone_1_type text,
  phone_2 text,
  phone_2_type text,
  phone_3 text,
  phone_3_type text,
  phone_4 text,
  phone_4_type text,
  phone_5 text,
  phone_5_type text,
  email_1 text,
  callable_phones int default 0,
  total_phones int default 0,
  has_email boolean default false,
  score int default 0,
  tier text,
  score_notes text,
  intel text,
  call_status text default 'not_called',
  call_notes text,
  follow_up_date date,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_leads_list on leads(list_id);
create index if not exists idx_leads_user on leads(user_id);
create index if not exists idx_leads_score on leads(score desc);
create index if not exists idx_lists_user on lists(user_id);

-- Row Level Security (each student sees only their own data)
alter table lists enable row level security;
alter table leads enable row level security;

drop policy if exists "users_own_lists" on lists;
create policy "users_own_lists" on lists
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users_own_leads" on leads;
create policy "users_own_leads" on leads
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ============================================================
-- ADMIN HELPERS
-- Run these as needed from the SQL Editor to manage students.
-- ============================================================

-- CREATE A NEW STUDENT ACCOUNT:
-- Replace the email and password below, then run this query.
-- The student uses these credentials to log in.
--
-- select auth.create_user('{
--   "email": "student@example.com",
--   "password": "their-password-here",
--   "email_confirm": true
-- }'::jsonb);


-- VIEW ALL STUDENTS AND THEIR USAGE:
--
-- select
--   u.email,
--   u.created_at as signed_up,
--   count(distinct l.id) as lists,
--   coalesce(sum(l.total_leads), 0) as total_leads
-- from auth.users u
-- left join lists l on l.user_id = u.id
-- group by u.id, u.email, u.created_at
-- order by u.created_at desc;


-- DELETE A STUDENT AND ALL THEIR DATA:
-- Replace the email below. This removes their account and all lists/leads.
--
-- delete from auth.users where email = 'student@example.com';


-- CLEAR A STUDENT'S LISTS (keep their account):
--
-- delete from lists where user_id = (
--   select id from auth.users where email = 'student@example.com'
-- );
