-- Private bucket `tutorial-videos` — create (idempotent) + RLS on storage.objects
-- Run in Supabase → SQL Editor. Safe to re-run.

-- Bucket: only insert when missing (never hits duplicate key on re-run)
insert into storage.buckets (id, name, public)
select 'tutorial-videos', 'tutorial-videos', false
where not exists (
  select 1 from storage.buckets where id = 'tutorial-videos'
);

-- Remove previous versions (old names + any duplicate runs)
drop policy if exists "tutorial_videos_insert_own_folder" on storage.objects;
drop policy if exists "tutorial_videos_select_own_folder" on storage.objects;
drop policy if exists "tutorial_videos_update_own_folder" on storage.objects;
drop policy if exists "tutorial_videos_delete_own_folder" on storage.objects;
drop policy if exists "Users can upload their own videos" on storage.objects;
drop policy if exists "Users can read their own videos" on storage.objects;
drop policy if exists "Users can delete their own videos" on storage.objects;

-- Path must be: tutorial-videos/{auth.uid()}/filename.ext
-- First path segment must match the signed-in user (storage.foldername(name)[1]).

-- Allow authenticated users to upload into their own folder
create policy "Users can upload their own videos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'tutorial-videos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to read their own objects (signed URLs still use service role server-side for public tutorials)
create policy "Users can read their own videos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'tutorial-videos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to delete their own objects
create policy "Users can delete their own videos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'tutorial-videos'
  and auth.uid()::text = (storage.foldername(name))[1]
);
