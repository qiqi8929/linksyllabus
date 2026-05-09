import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getStripe } from "./server";

export type GuideUnlockApplyResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; reason: string };

function isIdempotencyTableMissing(err: unknown): boolean {
  const e = err as { code?: string; message?: string; details?: string } | null;
  if (!e) return false;
  const blob = `${e.code ?? ""}\n${e.message ?? ""}\n${e.details ?? ""}`.toLowerCase();
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  if (blob.includes("stripe_guide_unlock_events") && /does not exist|could not find|undefined table/i.test(blob)) {
    return true;
  }
  return false;
}

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
    if (isIdempotencyTableMissing(idempotencyErr)) {
      console.error("[guideUnlock] stripe_guide_unlock_events table missing", idempotencyErr);
      return { ok: false, reason: "idempotency_table_missing" };
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

/**
 * Reconcile missing paid slots from Stripe by replaying paid guide_unlock sessions idempotently.
 * Used as a last-resort recovery when the user hits limit but webhook/return callback was delayed.
 */
export async function reconcileGuideUnlockSlotsFromStripe(userId: string): Promise<{
  attempted: number;
  applied: number;
  duplicates: number;
  failed: number;
  reasons: string[];
}> {
  const admin = createSupabaseAdminClient();
  const { data: subRow, error: subErr } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (subErr) {
    return { attempted: 0, applied: 0, duplicates: 0, failed: 1, reasons: ["subscription_read_failed"] };
  }
  const customerId = String(subRow?.stripe_customer_id ?? "").trim();
  if (!customerId) {
    return { attempted: 0, applied: 0, duplicates: 0, failed: 0, reasons: ["no_customer"] };
  }

  if (!env.stripe.secretKey()) {
    return { attempted: 0, applied: 0, duplicates: 0, failed: 1, reasons: ["stripe_not_configured"] };
  }

  const stripe = getStripe();
  const sessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 100 });
  const paidUnlocks = sessions.data.filter(
    (s) => s.metadata?.type === "guide_unlock" && s.metadata?.user_id === userId && s.payment_status === "paid"
  );

  let applied = 0;
  let duplicates = 0;
  let failed = 0;
  const reasons = new Set<string>();

  for (const s of paidUnlocks) {
    const r = await applyGuideUnlockFromPaidCheckoutSession(s, `reconcile:${s.id}`);
    if (r.ok) {
      if (r.duplicate) duplicates += 1;
      else applied += 1;
    } else {
      failed += 1;
      reasons.add(r.reason);
    }
  }

  return {
    attempted: paidUnlocks.length,
    applied,
    duplicates,
    failed,
    reasons: Array.from(reasons)
  };
}
