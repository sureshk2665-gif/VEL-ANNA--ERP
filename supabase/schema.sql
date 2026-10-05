-- VIPL ERP — Supabase schema (secure setup, used with Supabase Auth sign-in).
-- Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.
--
-- The whole ERP database is stored as one JSON document in a single row (id = 'main').
-- Only signed-in users (Supabase Auth) can read or write it; the public publishable/anon key
-- on its own gets nothing. Users are created by an administrator in
-- Authentication → Users (public sign-ups must be switched off — see DEPLOYMENT.md).

create table if not exists public.erp_data (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.erp_data enable row level security;

-- No access at all for anonymous (not signed-in) requests.
revoke all on table public.erp_data from anon;
grant select, insert, update on table public.erp_data to authenticated;

-- Remove the old open policy if this project was set up with it before.
drop policy if exists "erp_data_anon_all" on public.erp_data;

drop policy if exists "erp_data_read_signed_in" on public.erp_data;
create policy "erp_data_read_signed_in" on public.erp_data
  for select to authenticated using (true);

drop policy if exists "erp_data_insert_signed_in" on public.erp_data;
create policy "erp_data_insert_signed_in" on public.erp_data
  for insert to authenticated with check (true);

drop policy if exists "erp_data_update_signed_in" on public.erp_data;
create policy "erp_data_update_signed_in" on public.erp_data
  for update to authenticated using (true) with check (true);

-- (No delete policy: the app never deletes the row, so nobody can.)
