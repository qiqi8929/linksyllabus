-- Private bucket for user-uploaded tutorial source videos (path: {user_id}/{filename})
-- Run in Supabase SQL Editor after creating bucket "tutorial-videos" (private) in Dashboard → Storage,
-- or uncomment the insert below if your project allows inserting into storage.buckets.

-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values (
--   'tutorial-videos',
--   'tutorial-videos',
--   false,
--   524288000,
--   array['video/mp4','video/quicktime','video/x-msvideo']::text[]
-- )
-- on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- Policies: each user can only read/write/delete objects under folder named with their auth uid.

drop policy if exists "tutorial_videos_insert_own_folder" on storage.objects;
drop policy if exists "tutorial_videos_select_own_folder" on storage.objects;
drop policy if exists "tutorial_videos_update_own_folder" on storage.objects;
drop policy if exists "tutorial_videos_delete_own_folder" on storage.objects;

create policy "tutorial_videos_insert_own_folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'tutorial-videos'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "tutorial_videos_select_own_folder"
on storage.objects for select to authenticated
using (
  bucket_id = 'tutorial-videos'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "tutorial_videos_update_own_folder"
on storage.objects for update to authenticated
using (
  bucket_id = 'tutorial-videos'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'tutorial-videos'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "tutorial_videos_delete_own_folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'tutorial-videos'
  and split_part(name, '/', 1) = auth.uid()::text
);
