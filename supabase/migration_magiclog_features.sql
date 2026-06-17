-- Magic Log feature expansion (run in Supabase SQL editor)
-- For web mentor signing + RPCs, also run migration_web_signing_e2e.sql.
-- For user profile columns (step 3 onboarding), run migration_users_profile_e2e.sql.

alter table public.bluebook_work_orders
  add column if not exists signing_token text,
  add column if not exists signing_token_expires timestamptz,
  add column if not exists mentor_phone text;

alter table public.users
  add column if not exists is_journeyman boolean not null default false,
  add column if not exists journeyman_certificate_number text,
  add column if not exists default_mentor_name text,
  add column if not exists default_mentor_phone text;

alter table public.period_progress
  add column if not exists checklist_json jsonb not null default '{}'::jsonb;
