-- Optional: extra RLS policies if you created magiclog-signatures bucket during testing.
-- Primary bucket for mentor signatures remains bluebook-signatures.

insert into storage.buckets (id, name, public)
values ('bluebook-signatures', 'bluebook-signatures', false)
on conflict (id) do nothing;

drop policy if exists "bluebook_signatures read own" on storage.objects;
drop policy if exists "bluebook_signatures insert own" on storage.objects;
drop policy if exists "bluebook_signatures update own" on storage.objects;

create policy "bluebook_signatures read own"
on storage.objects for select
using (
  bucket_id = 'bluebook-signatures'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "bluebook_signatures insert own"
on storage.objects for insert
with check (
  bucket_id = 'bluebook-signatures'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "bluebook_signatures update own"
on storage.objects for update
using (
  bucket_id = 'bluebook-signatures'
  and auth.uid()::text = (storage.foldername(name))[1]
);
