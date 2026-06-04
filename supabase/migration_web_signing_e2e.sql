-- Magic Log web mentor signing (end-to-end)
-- Run once in Supabase SQL Editor. Safe to re-run (idempotent).
-- Fixes: signing_token_expires column, RPC mentor_signature_url, PostgREST schema cache.

-- ---------------------------------------------------------------------------
-- 1) Columns required by SMS / public sign links
-- ---------------------------------------------------------------------------
alter table public.bluebook_work_orders
  add column if not exists signing_token text,
  add column if not exists signing_token_expires timestamptz,
  add column if not exists mentor_phone text;

comment on column public.bluebook_work_orders.signing_token is
  'One-time token for public mentor sign link (cleared after sign-off).';
comment on column public.bluebook_work_orders.signing_token_expires is
  'Expiry for signing_token; null means no expiry.';
comment on column public.bluebook_work_orders.mentor_signature_url is
  'Storage path in bluebook-signatures bucket, e.g. {user_id}/{work_order_id}/mentor.png';

-- ---------------------------------------------------------------------------
-- 2) Token validation helper (column + video_urls JSON fallback)
-- ---------------------------------------------------------------------------
create or replace function public.work_order_signing_token_matches(
  p_signing_token text,
  p_signing_token_expires timestamptz,
  p_video_urls jsonb,
  p_token text
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  t text := nullif(trim(p_token), '');
  exp timestamptz;
  elem jsonb;
begin
  if t is null then
    return false;
  end if;

  if p_signing_token is not null and trim(p_signing_token) = t then
    if p_signing_token_expires is null or p_signing_token_expires > now() then
      return true;
    end if;
  end if;

  if jsonb_typeof(p_video_urls) = 'array' then
    for elem in select * from jsonb_array_elements(p_video_urls)
    loop
      if coalesce(elem->>'signingToken', elem->>'signing_token') = t then
        begin
          exp := coalesce(
            (elem->>'signingTokenExpires')::timestamptz,
            (elem->>'signing_token_expires')::timestamptz
          );
        exception when others then
          exp := null;
        end;
        if exp is null or exp > now() then
          return true;
        end if;
      end if;
    end loop;
  end if;

  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Load work order for public sign page
-- ---------------------------------------------------------------------------
create or replace function public.get_work_order_for_signing(
  p_work_order_id uuid,
  p_token text
)
returns table (
  work_order_id uuid,
  task_name text,
  competence_name text,
  hours numeric,
  user_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  wo public.bluebook_work_orders%rowtype;
begin
  select * into wo
  from public.bluebook_work_orders
  where id = p_work_order_id;

  if not found then
    return;
  end if;

  if not public.work_order_signing_token_matches(
    wo.signing_token,
    wo.signing_token_expires,
    wo.video_urls,
    p_token
  ) then
    raise exception 'Invalid or expired signing token';
  end if;

  return query
  select
    wo.id,
    wo.task_name,
    wo.competence_name,
    wo.hours,
    wo.user_id,
    wo.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Complete sign-off: sets mentor_signature_url + clears token
-- ---------------------------------------------------------------------------
create or replace function public.complete_work_order_signing_with_token(
  p_work_order_id uuid,
  p_token text,
  p_signature_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wo public.bluebook_work_orders%rowtype;
  expected_path text;
begin
  if p_signature_path is null or length(trim(p_signature_path)) = 0 then
    raise exception 'Signature path is required';
  end if;

  select * into wo
  from public.bluebook_work_orders
  where id = p_work_order_id
  for update;

  if not found then
    raise exception 'Work order not found';
  end if;

  if wo.status = 'signed' then
    raise exception 'Already signed';
  end if;

  if not public.work_order_signing_token_matches(
    wo.signing_token,
    wo.signing_token_expires,
    wo.video_urls,
    p_token
  ) then
    raise exception 'Invalid or expired signing token';
  end if;

  expected_path := wo.user_id::text || '/' || p_work_order_id::text || '/mentor.png';
  if trim(p_signature_path) <> expected_path then
    raise exception 'Invalid signature path (expected %)', expected_path;
  end if;

  update public.bluebook_work_orders
  set
    status = 'signed',
    signed_at = now(),
    mentor_signature_url = trim(p_signature_path),
    signing_token = null,
    signing_token_expires = null
  where id = p_work_order_id;

  if wo.hours is not null and wo.hours > 0 then
    insert into public.hour_logs (user_id, work_order_id, hours, period)
    select wo.user_id, p_work_order_id, wo.hours, wo.period
    where not exists (
      select 1 from public.hour_logs hl
      where hl.work_order_id = p_work_order_id
    );
  end if;
end;
$$;

revoke all on function public.work_order_signing_token_matches(text, timestamptz, jsonb, text) from public;
revoke all on function public.get_work_order_for_signing(uuid, text) from public;
revoke all on function public.complete_work_order_signing_with_token(uuid, text, text) from public;

grant execute on function public.get_work_order_for_signing(uuid, text) to service_role;
grant execute on function public.complete_work_order_signing_with_token(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5) Refresh PostgREST schema cache (fixes "column not in schema cache")
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
