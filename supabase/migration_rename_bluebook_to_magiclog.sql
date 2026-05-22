-- Run once in Supabase SQL Editor if you already applied migration_bluebook.sql
-- with bluebook_* names. Safe to re-run only before renames exist (see notices).

-- users column
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users'
      and column_name = 'bluebook_onboarding_complete'
  ) then
    alter table public.users
      rename column bluebook_onboarding_complete to magiclog_onboarding_complete;
  end if;
end $$;

-- work orders table + indexes
do $$
begin
  if to_regclass('public.bluebook_work_orders') is not null then
    alter table public.bluebook_work_orders rename to magiclog_work_orders;
  end if;
end $$;

alter index if exists bluebook_work_orders_user_id_idx
  rename to magiclog_work_orders_user_id_idx;
alter index if exists bluebook_work_orders_created_at_idx
  rename to magiclog_work_orders_created_at_idx;

-- reminder logs table + index
do $$
begin
  if to_regclass('public.bluebook_reminder_logs') is not null then
    alter table public.bluebook_reminder_logs rename to magiclog_reminder_logs;
  end if;
end $$;

alter index if exists bluebook_reminder_logs_user_type_idx
  rename to magiclog_reminder_logs_user_type_idx;

-- storage bucket (signatures)
insert into storage.buckets (id, name, public)
values ('magiclog-signatures', 'magiclog-signatures', false)
on conflict (id) do nothing;

update storage.objects
set bucket_id = 'magiclog-signatures'
where bucket_id = 'bluebook-signatures';

delete from storage.buckets where id = 'bluebook-signatures';

drop policy if exists "bluebook_signatures read own" on storage.objects;
drop policy if exists "bluebook_signatures insert own" on storage.objects;
drop policy if exists "bluebook_signatures update own" on storage.objects;

create policy "magiclog_signatures read own"
on storage.objects for select
using (
  bucket_id = 'magiclog-signatures'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "magiclog_signatures insert own"
on storage.objects for insert
with check (
  bucket_id = 'magiclog-signatures'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "magiclog_signatures update own"
on storage.objects for update
using (
  bucket_id = 'magiclog-signatures'
  and auth.uid()::text = (storage.foldername(name))[1]
);
