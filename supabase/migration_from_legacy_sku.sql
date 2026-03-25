-- 若你已有旧版 skus（含 youtube_url / start_time / end_time），在 Supabase SQL 中按需执行。
-- 1) 先备份数据。2) 若已按新 schema 建表，可跳过本文件。

-- 创建 steps 表（若尚未存在，可先跑完整 schema.sql）

-- 把旧 SKU 的一整段视频迁成「第 1 步」
insert into public.steps (sku_id, step_number, step_name, description, youtube_url, start_time, end_time)
select
  id,
  1,
  name,
  coalesce(description, ''),
  youtube_url,
  coalesce(start_time, 0),
  end_time
from public.skus
where exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'skus' and column_name = 'youtube_url'
)
on conflict (sku_id, step_number) do nothing;

-- 删除旧列（PostgreSQL）
alter table public.skus drop column if exists youtube_url;
alter table public.skus drop column if exists start_time;
alter table public.skus drop column if exists end_time;
