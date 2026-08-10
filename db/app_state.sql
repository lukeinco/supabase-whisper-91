-- Run this in the Supabase SQL editor for project druggbmhwfqwomyjvpgc.
-- app_state is server-only storage: RLS on, ZERO policies, no grants to anon/authenticated.
-- Only the service role key (which bypasses RLS) can read or write it.

create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- Deliberately NO policies.
revoke all on public.app_state from anon, authenticated;
revoke all on public.app_state from public;

grant all on public.app_state to service_role;
