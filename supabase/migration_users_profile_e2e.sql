-- Magic Log user profile columns (onboarding step 3 + settings)
-- Run in Supabase SQL Editor. Safe to re-run.

alter table public.users
  add column if not exists is_journeyman boolean not null default false,
  add column if not exists journeyman_certificate_number text,
  add column if not exists default_mentor_name text,
  add column if not exists default_mentor_phone text;

comment on column public.users.is_journeyman is
  'Apprentice is also a journeyman certificate holder.';
comment on column public.users.default_mentor_name is
  'Default mentor name for SMS sign-off (often same as sponsor).';
comment on column public.users.default_mentor_phone is
  'Default mentor phone for SMS sign-off links.';

-- Refresh PostgREST schema cache (fixes "column not in schema cache")
notify pgrst, 'reload schema';
