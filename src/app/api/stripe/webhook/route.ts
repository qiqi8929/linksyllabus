import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const type = session.metadata?.type;
    const userId = session.metadata?.user_id;

    const admin = createSupabaseAdminClient();

    if (type === "sku") {
      const skuId = session.metadata?.sku_id;
      if (userId && skuId) {
        await admin.from("skus").update({ is_active: true }).eq("id", skuId).eq("user_id", userId);
      }
    }

    if (type === "subscription") {
      if (userId) {
        let status = "active";
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(String(session.subscription));
          status = sub.status;
        }
        const stripeCustomerId = session.customer ? String(session.customer) : null;
        await admin.from("subscriptions").upsert({
          user_id: userId,
          stripe_customer_id: stripeCustomerId ?? undefined,
          status
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}

