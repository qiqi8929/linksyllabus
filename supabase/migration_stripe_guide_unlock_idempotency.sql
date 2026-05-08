create table if not exists public.stripe_guide_unlock_events (
  session_id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  stripe_event_id text,
  created_at timestamptz not null default now()
);

alter table public.stripe_guide_unlock_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stripe_guide_unlock_events'
      and policyname = 'service_role_full_access'
  ) then
    create policy "service_role_full_access"
      on public.stripe_guide_unlock_events
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end
$$;
