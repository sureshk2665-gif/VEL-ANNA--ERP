-- VIPL ERP — Supabase schema.
-- Run once in Supabase → SQL Editor for a NEW project. Safe to re-run (idempotent).
-- The whole ERP database is stored as one JSON document in a single row (id = 'main').

create table if not exists public.erp_data (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.erp_data enable row level security;

-- The app signs users in with its own username/password screen and talks to Supabase with the
-- public anon key, so the anon role needs read/write on this table.
-- WARNING: this means anyone who has the anon key (it is visible in the browser) can read and
-- overwrite the data. See DEPLOYMENT.md → "Security".
drop policy if exists "erp_data_anon_all" on public.erp_data;
create policy "erp_data_anon_all" on public.erp_data
  for all using (true) with check (true);
