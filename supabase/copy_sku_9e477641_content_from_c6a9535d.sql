-- One-off: copy all tutorial content from Whale Shark SKU onto target SKU.
-- Target URL stays: /tutorial/9e477641-053c-4827-b99d-4227fb02843c
--
-- Source: c6a9535d-4a6c-4722-9d75-94f2ebfbdd09 (Whale Shark)
-- Target: 9e477641-053c-4827-b99d-4227fb02843c (receives the same content)
--
-- Preserved on target: id, user_id, created_at (ownership and Stripe/email SKU id unchanged).
-- Copied from source: sku text fields, times, materials/tools, branding, scan_count, is_active;
--   steps are replaced (new step row UUIDs; /play/[step_id] links for old steps will no longer match).
--
-- Run in Supabase Dashboard → SQL Editor as a role that bypasses RLS (e.g. postgres).

begin;

do $$
begin
  if not exists (
    select 1 from public.skus where id = '9e477641-053c-4827-b99d-4227fb02843c'
  ) then
    raise exception 'Target sku 9e477641-053c-4827-b99d-4227fb02843c not found';
  end if;
  if not exists (
    select 1 from public.skus where id = 'c6a9535d-4a6c-4722-9d75-94f2ebfbdd09'
  ) then
    raise exception 'Source sku c6a9535d-4a6c-4722-9d75-94f2ebfbdd09 not found';
  end if;
end $$;

update public.skus as t
set
  name = s.name,
  description = s.description,
  youtube_url = s.youtube_url,
  start_time = s.start_time,
  end_time = s.end_time,
  scan_count = s.scan_count,
  is_active = s.is_active,
  materials_text = s.materials_text,
  tools_text = s.tools_text,
  creator_name = s.creator_name,
  creator_site = s.creator_site,
  creator_logo = s.creator_logo,
  level = s.level,
  author = s.author
from public.skus as s
where t.id = '9e477641-053c-4827-b99d-4227fb02843c'
  and s.id = 'c6a9535d-4a6c-4722-9d75-94f2ebfbdd09';

delete from public.steps
where sku_id = '9e477641-053c-4827-b99d-4227fb02843c';

insert into public.steps (
  sku_id,
  step_number,
  step_name,
  description,
  youtube_url,
  start_time,
  end_time,
  scan_count
)
select
  '9e477641-053c-4827-b99d-4227fb02843c',
  step_number,
  step_name,
  description,
  youtube_url,
  start_time,
  end_time,
  scan_count
from public.steps
where sku_id = 'c6a9535d-4a6c-4722-9d75-94f2ebfbdd09'
order by step_number;

commit;
