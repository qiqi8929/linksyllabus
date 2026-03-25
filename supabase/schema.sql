-- LinkSyllabus: skus = 教程；steps = 每步独立视频片段与 QR（/play/[step_id]）
create extension if not exists "uuid-ossp";

-- users
create table if not exists public.users (
  id uuid primary key,
  email text unique,
  created_at timestamptz not null default now()
);

-- skus（教程容器：不再含 youtube / 起止秒）
create table if not exists public.skus (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  scan_count int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- steps（每步一条播放链接 + 片段）
create table if not exists public.steps (
  id uuid primary key default uuid_generate_v4(),
  sku_id uuid not null references public.skus(id) on delete cascade,
  step_number int not null,
  step_name text not null,
  description text not null default '',
  youtube_url text not null,
  start_time int not null default 0,
  end_time int not null,
  scan_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (sku_id, step_number)
);

create table if not exists public.subscriptions (
  user_id uuid primary key references public.users(id) on delete cascade,
  stripe_customer_id text,
  status text not null default 'inactive',
  created_at timestamptz not null default now()
);

create index if not exists skus_user_id_idx on public.skus(user_id);
create index if not exists steps_sku_id_idx on public.steps(sku_id);

-- RLS
alter table public.users enable row level security;
alter table public.skus enable row level security;
alter table public.steps enable row level security;
alter table public.subscriptions enable row level security;

-- users
create policy "users can view self"
on public.users for select
using (auth.uid() = id);

create policy "users can insert self"
on public.users for insert
with check (auth.uid() = id);

-- skus
create policy "skus are readable by owner"
on public.skus for select
using (auth.uid() = user_id);

create policy "active skus are readable by anyone"
on public.skus for select
using (is_active = true);

create policy "skus are insertable by owner"
on public.skus for insert
with check (auth.uid() = user_id);

create policy "skus are updatable by owner"
on public.skus for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- steps：所属教程的拥有者可读写；激活教程的步骤可被匿名读取（便于扫码）
create policy "steps_select_owner_or_active_sku"
on public.steps for select
using (
  exists (
    select 1 from public.skus s
    where s.id = steps.sku_id
      and (s.user_id = auth.uid() or s.is_active = true)
  )
);

create policy "steps_insert_owner"
on public.steps for insert
with check (
  exists (
    select 1 from public.skus s
    where s.id = sku_id and s.user_id = auth.uid()
  )
);

create policy "steps_update_owner"
on public.steps for update
using (
  exists (
    select 1 from public.skus s
    where s.id = sku_id and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.skus s
    where s.id = sku_id and s.user_id = auth.uid()
  )
);

create policy "steps_delete_owner"
on public.steps for delete
using (
  exists (
    select 1 from public.skus s
    where s.id = sku_id and s.user_id = auth.uid()
  )
);

-- subscriptions
create policy "subscriptions are readable by owner"
on public.subscriptions for select
using (auth.uid() = user_id);

create policy "subscriptions are updatable by owner"
on public.subscriptions for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
