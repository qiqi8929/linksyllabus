import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getStripe } from "./server";

export type GuideUnlockApplyResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; reason: string };

/**
 * Idempotently increment `users.paid_guide_slots` for a paid guide-unlock Checkout session.
 * Shared by the Stripe webhook and the return-URL sync when webhooks are delayed or misconfigured.
 */
export async function applyGuideUnlockFromPaidCheckoutSession(
  session: Stripe.Checkout.Session,
  stripeEventId: string,
  opts?: { forcePaid?: boolean }
): Promise<GuideUnlockApplyResult> {
  const userId = session.metadata?.user_id;
  if (session.metadata?.type !== "guide_unlock" || !userId) {
    return { ok: false, reason: "not_guide_unlock" };
  }
  const paid =
    session.payment_status === "paid" || opts?.forcePaid === true;
  if (!paid) {
    return { ok: false, reason: "not_paid" };
  }
  if (!session.id) {
    return { ok: false, reason: "missing_session_id" };
  }

  const admin = createSupabaseAdminClient();
  const { error: idempotencyErr } = await admin.from("stripe_guide_unlock_events").insert({
    session_id: session.id,
    user_id: userId,
    stripe_event_id: stripeEventId
  });

  if (idempotencyErr) {
    if ((idempotencyErr as { code?: string }).code === "23505") {
      return { ok: true, duplicate: true };
    }
    console.error("[guideUnlock] idempotency insert failed", idempotencyErr);
    return { ok: false, reason: "idempotency_insert_failed" };
  }

  const { data: row } = await admin
    .from("users")
    .select("paid_guide_slots")
    .eq("id", userId)
    .maybeSingle();
  const current = Math.max(0, Number(row?.paid_guide_slots ?? 0));
  const { error: upErr } = await admin
    .from("users")
    .update({ paid_guide_slots: current + 1 })
    .eq("id", userId);
  if (upErr) {
    console.error("[guideUnlock] paid_guide_slots increment failed", upErr);
    return { ok: false, reason: "update_failed" };
  }
  return { ok: true, duplicate: false };
}

/**
 * After redirect from Checkout, verify session with Stripe and apply slot if not already recorded.
 */
export async function tryApplyGuideUnlockFromCheckoutSessionId(
  sessionId: string,
  expectedUserId: string
): Promise<GuideUnlockApplyResult> {
  if (!env.stripe.secretKey()) {
    return { ok: false, reason: "stripe_not_configured" };
  }
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.type !== "guide_unlock") {
    return { ok: false, reason: "not_guide_unlock" };
  }
  if (session.metadata?.user_id !== expectedUserId) {
    return { ok: false, reason: "user_mismatch" };
  }
  if (session.payment_status !== "paid") {
    return { ok: false, reason: "not_paid" };
  }
  return applyGuideUnlockFromPaidCheckoutSession(session, `sync:${sessionId}`);
}
