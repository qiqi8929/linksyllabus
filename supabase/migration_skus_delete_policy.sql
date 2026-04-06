-- Run in Supabase SQL Editor if dashboard delete fails with RLS.
-- Owners can delete their own tutorials (steps cascade).

drop policy if exists "skus are deletable by owner" on public.skus;

create policy "skus are deletable by owner"
on public.skus for delete
using (auth.uid() = user_id);
