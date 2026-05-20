-- My Bluebook (Alberta MVP) — extends public.users (app uses `users`, not `profiles`)

alter table public.users add column if not exists ait_id text;
alter table public.users add column if not exists trade text;
alter table public.users add column if not exists current_period integer not null default 1;
alter table public.users add column if not exists apprenticeship_start_date date;
alter table public.users add column if not exists sponsor_name text;
alter table public.users add column if not exists sponsor_phone text;
alter table public.users add column if not exists province text not null default 'alberta';
alter table public.users add column if not exists bluebook_onboarding_complete boolean not null default false;

create table if not exists public.bluebook_work_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  competence_name text not null,
  competence_type text not null check (competence_type in ('mandatory', 'optional')),
  period integer not null,
  task_name text,
  ai_steps jsonb,
  video_urls jsonb,
  include_video boolean not null default true,
  mentor_name text,
  mentor_signature_url text,
  signed_at timestamptz,
  hours numeric(4, 2),
  status text not null default 'draft' check (status in ('draft', 'completed', 'signed')),
  created_at timestamptz not null default now()
);

create index if not exists bluebook_work_orders_user_id_idx on public.bluebook_work_orders(user_id);
create index if not exists bluebook_work_orders_created_at_idx on public.bluebook_work_orders(created_at desc);

create table if not exists public.hour_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  work_order_id uuid references public.bluebook_work_orders(id) on delete set null,
  hours numeric(4, 2) not null,
  period integer not null,
  logged_at timestamptz not null default now()
);

create index if not exists hour_logs_user_period_idx on public.hour_logs(user_id, period);

create table if not exists public.period_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  period integer not null,
  total_hours numeric(6, 2) not null default 0,
  mandatory_completed integer not null default 0,
  optional_completed integer not null default 0,
  period_complete boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, period)
);

alter table public.bluebook_work_orders enable row level security;
alter table public.hour_logs enable row level security;
alter table public.period_progress enable row level security;

create policy "bluebook_work_orders select own"
on public.bluebook_work_orders for select
using (auth.uid() = user_id);

create policy "bluebook_work_orders insert own"
on public.bluebook_work_orders for insert
with check (auth.uid() = user_id);

create policy "bluebook_work_orders update own"
on public.bluebook_work_orders for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "bluebook_work_orders delete own"
on public.bluebook_work_orders for delete
using (auth.uid() = user_id);

create policy "hour_logs select own"
on public.hour_logs for select
using (auth.uid() = user_id);

create policy "hour_logs insert own"
on public.hour_logs for insert
with check (auth.uid() = user_id);

create policy "hour_logs update own"
on public.hour_logs for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "period_progress select own"
on public.period_progress for select
using (auth.uid() = user_id);

create policy "period_progress insert own"
on public.period_progress for insert
with check (auth.uid() = user_id);

create policy "period_progress update own"
on public.period_progress for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Private bucket for mentor signatures (path: {user_id}/{work_order_id}.png)
insert into storage.buckets (id, name, public)
values ('bluebook-signatures', 'bluebook-signatures', false)
on conflict (id) do nothing;

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
