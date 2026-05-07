-- Paid tier: each successful Stripe "guide_unlock" checkout increments this by 1.
-- Max guides per user = 1 (free) + paid_guide_slots.

alter table public.users
add column if not exists paid_guide_slots int not null default 0;
