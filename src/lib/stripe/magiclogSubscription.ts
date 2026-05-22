import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { STRIPE_PRICES } from "@/lib/stripe/prices";

const FALLBACK_PLACEHOLDER = "price_REPLACE_ME_MAGICLOG_1999";

/**
 * Magic Log Stripe Price ID from hosting env (Vercel: MAGICLOG_STRIPE_PRICE_ID).
 * Legacy alias: STRIPE_PRICE_ID_BLUEBOOK_MONTHLY
 */
export function getMagicLogStripePriceId(): string {
  return (
    process.env.MAGICLOG_STRIPE_PRICE_ID?.trim() ||
    process.env.STRIPE_PRICE_ID_BLUEBOOK_MONTHLY?.trim() ||
    env.stripe.priceIdMagicLogMonthly()?.trim() ||
    STRIPE_PRICES.magiclogMonthlyUsd1999 ||
    FALLBACK_PLACEHOLDER
  );
}

/** What the app resolves at runtime (for ops / debugging). */
export function describeMagicLogStripePriceConfig(): {
  resolvedPriceId: string;
  envMagicLogStripePriceId: string | null;
  envLegacyPriceId: string | null;
  isPlaceholder: boolean;
} {
  const resolved = getMagicLogStripePriceId();
  const envMagicLog = process.env.MAGICLOG_STRIPE_PRICE_ID?.trim() || null;
  const envLegacy = process.env.STRIPE_PRICE_ID_BLUEBOOK_MONTHLY?.trim() || null;
  return {
    resolvedPriceId: resolved,
    envMagicLogStripePriceId: envMagicLog,
    envLegacyPriceId: envLegacy,
    isPlaceholder: resolved === FALLBACK_PLACEHOLDER
  };
}

export async function activateMagicLogSubscription(
  admin: SupabaseClient,
  params: { userId: string; stripeCustomerId?: string; status?: string }
) {
  const { userId, stripeCustomerId, status = "active" } = params;
  await admin.from("subscriptions").upsert({
    user_id: userId,
    stripe_customer_id: stripeCustomerId ?? null,
    status
  });
}

export async function handleMagicLogCheckoutCompleted(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session
) {
  const userId = session.metadata?.user_id;
  if (!userId) return;

  await admin
    .from("users")
    .update({ bluebook_onboarding_complete: true })
    .eq("id", userId);

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;

  await activateMagicLogSubscription(admin, {
    userId,
    stripeCustomerId: customerId ?? undefined,
    status: "trialing"
  });
}
