-- Atomically record idempotency + increment paid_guide_slots in one transaction.
-- Fixes: insert into stripe_guide_unlock_events succeeding then users update failing left
-- retries stuck on duplicate session_id with no slot increment.
create or replace function public.apply_stripe_guide_unlock(
  p_session_id text,
  p_user_id uuid,
  p_stripe_event_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with ins as (
    insert into public.stripe_guide_unlock_events (session_id, user_id, stripe_event_id)
    values (p_session_id, p_user_id, p_stripe_event_id)
    on conflict (session_id) do nothing
    returning 1
  )
  update public.users u
  set paid_guide_slots = coalesce(u.paid_guide_slots, 0) + 1
  from ins
  where u.id = p_user_id;

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.apply_stripe_guide_unlock(text, uuid, text) from public;
grant execute on function public.apply_stripe_guide_unlock(text, uuid, text) to service_role;
