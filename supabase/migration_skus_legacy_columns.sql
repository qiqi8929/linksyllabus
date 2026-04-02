-- Align older databases with skus placeholders required by app inserts (see schema.sql).
-- Safe to run once; skips if columns already exist.

alter table public.skus add column if not exists youtube_url text not null default '';
alter table public.skus add column if not exists start_time int not null default 0;
alter table public.skus add column if not exists end_time int not null default 0;
