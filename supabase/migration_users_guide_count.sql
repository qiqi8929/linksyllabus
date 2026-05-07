alter table public.users
add column if not exists guide_count int not null default 0;

update public.users u
set guide_count = coalesce(s.cnt, 0)
from (
  select user_id, count(*)::int as cnt
  from public.skus
  group by user_id
) s
where u.id = s.user_id;
