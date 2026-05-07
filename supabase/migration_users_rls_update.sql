-- RLS fix: allow authenticated users to UPDATE their own row.
-- Required for guide_count bumps from Next.js server actions.
--
-- Those actions use createSupabaseServerClient() (anon key + user JWT).
-- They do NOT use the service role key — RLS applies.
--
-- If your project already has differently named policies, you can either
-- keep them and add only the missing UPDATE policy below, or align names.

-- Repo default policy names (from supabase/schema.sql):
--   "users can view self"   -> SELECT
--   "users can insert self" -> INSERT
-- This migration adds UPDATE (formerly missing):

drop policy if exists "users can update own row" on public.users;

create policy "users can update own row"
on public.users
for update
using (auth.uid() = id)
with check (auth.uid() = id);
