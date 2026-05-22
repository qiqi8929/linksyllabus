import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { STRIPE_PRICES } from "@/lib/stripe/prices";

const FALLBACK_PLACEHOLDER = "price_REPLACE_ME_BLUEBOOK_1999";

/**
 * Bluebook Stripe Price ID from hosting env.
 * Primary: BLUEBOOK_STRIPE_PRICE_ID
 * Legacy: STRIPE_PRICE_ID_BLUEBOOK_MONTHLY
 */
export function getBluebookStripePriceId(): string {
  return (
    process.env.BLUEBOOK_STRIPE_PRICE_ID?.trim() ||
    process.env.STRIPE_PRICE_ID_BLUEBOOK_MONTHLY?.trim() ||
    env.stripe.priceIdBluebookMonthly()?.trim() ||
    STRIPE_PRICES.bluebookMonthlyUsd1999 ||
    FALLBACK_PLACEHOLDER
  );
}

/** What the app resolves at runtime (for ops / debugging). */
export function describeBluebookStripePriceConfig(): {
  resolvedPriceId: string;
  envBluebookStripePriceId: string | null;
  envLegacyPriceId: string | null;
  isPlaceholder: boolean;
} {
  const resolved = getBluebookStripePriceId();
  const envBluebook = process.env.BLUEBOOK_STRIPE_PRICE_ID?.trim() || null;
  const envLegacy = process.env.STRIPE_PRICE_ID_BLUEBOOK_MONTHLY?.trim() || null;
  return {
    resolvedPriceId: resolved,
    envBluebookStripePriceId: envBluebook,
    envLegacyPriceId: envLegacy,
    isPlaceholder: resolved === FALLBACK_PLACEHOLDER
  };
}

export async function activateBluebookSubscription(
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

export async function handleBluebookCheckoutCompleted(
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

  await activateBluebookSubscription(admin, {
    userId,
    stripeCustomerId: customerId ?? undefined,
    status: "active"
  });
}
