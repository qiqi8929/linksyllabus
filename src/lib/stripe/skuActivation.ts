import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getStripe } from "./server";

/**
 * Sets `skus.is_active = true` when Checkout metadata matches. Used by webhook.
 */
export async function activateSkuFromCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<boolean> {
  if (session.metadata?.type !== "sku") return false;
  const userId = session.metadata?.user_id;
  const skuId = session.metadata?.sku_id;
  if (!userId || !skuId) return false;

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("skus")
    .update({ is_active: true })
    .eq("id", skuId)
    .eq("user_id", userId);

  return !error;
}

/**
 * After Stripe redirects to `/dashboard/success`, verify the Checkout Session server-side
 * and activate the SKU. Fixes deployments where the webhook URL/secret is missing or delayed.
 */
export async function tryActivateSkuFromCheckoutSessionId(
  sessionId: string,
  expectedSkuId: string,
  expectedUserId: string
): Promise<boolean> {
  if (!env.stripe.secretKey()) return false;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.metadata?.type !== "sku") return false;
  if (session.metadata?.sku_id !== expectedSkuId) return false;
  if (session.metadata?.user_id !== expectedUserId) return false;
  if (session.payment_status !== "paid") return false;

  return activateSkuFromCheckoutSession(session);
}
