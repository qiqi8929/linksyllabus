-- Optional branding for print manual (cover + footer). Safe to run on existing DBs.
alter table public.skus add column if not exists creator_name text;
alter table public.skus add column if not exists creator_site text;
alter table public.skus add column if not exists creator_logo text;
alter table public.skus add column if not exists level text;
alter table public.skus add column if not exists author text;
