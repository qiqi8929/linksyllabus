import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { env } from "@/lib/env";
import { applyGuideUnlockFromPaidCheckoutSession } from "@/lib/stripe/guideUnlock";
import { activateSkuFromCheckoutSession } from "@/lib/stripe/skuActivation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { handleBluebookCheckoutCompleted } from "@/lib/stripe/magiclogSubscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reasons that historically indicated a transient infra issue (logged when apply fails). */
function guideUnlockWebhookShouldRetry(reason: string): boolean {
  return new Set([
    "rpc_failed",
    "rpc_not_deployed",
    "supabase_admin_unconfigured",
    "idempotency_table_missing"
  ]).has(reason);
}

export async function POST(req: Request) {
  const webhookSecret = env.stripe.webhookSecret()?.trim();
  if (!webhookSecret) {
    return new NextResponse("Stripe webhook is not configured", { status: 503 });
  }

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    console.error("[stripe webhook] Stripe is not configured (STRIPE_SECRET_KEY)", e);
    return new NextResponse("Stripe is not configured", { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new NextResponse("Missing stripe-signature", { status: 400 });

  const rawBody = Buffer.from(await req.arrayBuffer());

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "invalid signature";
    return new NextResponse(`Webhook Error: ${msg}`, { status: 400 });
  }

  console.log("[stripe webhook] received", event.type, event.id);

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const type = session.metadata?.type;
      const userId = session.metadata?.user_id;

      const paid =
        session.payment_status === "paid" ||
        event.type === "checkout.session.async_payment_succeeded";

      if (type === "sku" && paid) {
        try {
          const ok = await activateSkuFromCheckoutSession(session);
          if (!ok) {
            console.error("[stripe webhook] sku activation returned false", { sessionId: session.id });
          }
        } catch (e) {
          console.error("[stripe webhook] sku activation threw", e);
        }
      }

      // Atomic idempotency + paid_guide_slots via apply_stripe_guide_unlock (service role / RLS bypass).
      if (type === "guide_unlock" && userId && paid) {
        const result = await applyGuideUnlockFromPaidCheckoutSession(session, event.id, {
          forcePaid: event.type === "checkout.session.async_payment_succeeded"
        });
        if (!result.ok) {
          console.error("[stripe webhook] guide_unlock apply failed", {
            userId,
            reason: result.reason,
            sessionId: session.id,
            wouldRetry: guideUnlockWebhookShouldRetry(result.reason)
          });
        }
      }

      if (type === "bluebook_subscription" && userId) {
        try {
          const admin = createSupabaseAdminClient();
          await handleBluebookCheckoutCompleted(admin, session);
        } catch (e) {
          console.error("[stripe webhook] bluebook_subscription failed", e);
        }
      }
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      if (userId) {
        try {
          const admin = createSupabaseAdminClient();
          const status =
            sub.status === "active" || sub.status === "trialing"
              ? "active"
              : sub.status;
          await admin.from("subscriptions").upsert({
            user_id: userId,
            status,
            stripe_customer_id:
              typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null
          });
        } catch (e) {
          console.error("[stripe webhook] subscription status update failed", e);
        }
      }
    }
  } catch (e) {
    console.error("[stripe webhook] unexpected error after verify", e);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

