import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { env } from "@/lib/env";
import { applyGuideUnlockFromPaidCheckoutSession } from "@/lib/stripe/guideUnlock";
import { activateSkuFromCheckoutSession } from "@/lib/stripe/skuActivation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const webhookSecret = env.stripe.webhookSecret();
  if (!webhookSecret) {
    return new NextResponse("Stripe webhook is not configured", { status: 503 });
  }

  const stripe = getStripe();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new NextResponse("Missing stripe-signature", { status: 400 });

  const rawBody = Buffer.from(await req.arrayBuffer());

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    return new NextResponse(`Webhook Error: ${err?.message ?? "invalid signature"}`, { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const type = session.metadata?.type;
    const userId = session.metadata?.user_id;

    if (type === "sku") {
      const paid =
        session.payment_status === "paid" ||
        event.type === "checkout.session.async_payment_succeeded";
      if (paid) {
        await activateSkuFromCheckoutSession(session);
      }
    }

    // Same idempotent apply as GET /api/stripe/guide-unlock-return: if return URL already ran,
    // stripe_guide_unlock_events insert hits 23505 and paid_guide_slots is not incremented again.
    if (type === "guide_unlock" && userId) {
      const paid =
        session.payment_status === "paid" ||
        event.type === "checkout.session.async_payment_succeeded";
      if (paid) {
        try {
          const result = await applyGuideUnlockFromPaidCheckoutSession(session, event.id, {
            forcePaid: event.type === "checkout.session.async_payment_succeeded"
          });
          if (!result.ok) {
            console.error("[stripe webhook] guide_unlock apply failed", {
              userId,
              reason: result.reason,
              sessionId: session.id
            });
          }
        } catch (e) {
          console.error("[stripe webhook] guide_unlock handler error", e);
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}

