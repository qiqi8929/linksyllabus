import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

    const admin = createSupabaseAdminClient();

    if (type === "sku") {
      const paid =
        session.payment_status === "paid" ||
        event.type === "checkout.session.async_payment_succeeded";
      if (paid) {
        await activateSkuFromCheckoutSession(session);
      }
    }

    if (type === "guide_unlock" && userId) {
      const paid =
        session.payment_status === "paid" ||
        event.type === "checkout.session.async_payment_succeeded";
      if (paid) {
        try {
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
            console.error("[stripe webhook] guide_unlock increment failed", upErr);
          }
        } catch (e) {
          console.error("[stripe webhook] guide_unlock handler error", e);
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}

