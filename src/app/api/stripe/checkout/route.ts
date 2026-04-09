import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { STRIPE_PRICES } from "@/lib/stripe/prices";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload =
  | { type: "subscription" }
  | { type: "sku"; skuId: string };

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req);
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = (await req.json()) as Payload;

    const admin = createSupabaseAdminClient();
    await admin.from("users").upsert({ id: user.id, email: user.email });

    const appUrl = env.appUrl();
    const cancel_url = `${appUrl}/dashboard?checkout=cancel`;

    const stripe = getStripe();

    // Ensure stripe customer for subscription tracking
    const { data: subRow } = await admin
      .from("subscriptions")
      .select("stripe_customer_id,status")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = subRow?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id }
      });
      customerId = customer.id;
      await admin.from("subscriptions").upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        status: subRow?.status ?? "inactive"
      });
    }

    if (payload.type === "subscription") {
      const success_url = `${appUrl}/dashboard?checkout=success`;
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [
          { price: STRIPE_PRICES.subscriptionMonthlyUsd199, quantity: 1 }
        ],
        success_url,
        cancel_url,
        metadata: {
          type: "subscription",
          user_id: user.id
        }
      });
      return NextResponse.json({ url: session.url });
    }

    const skuId = payload.skuId;
    const { data: sku } = await admin
      .from("skus")
      .select("id,user_id,is_active")
      .eq("id", skuId)
      .maybeSingle();

    if (!sku)
      return NextResponse.json({ error: "SKU not found" }, { status: 404 });
    if (sku.user_id !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const successSkuUrl = `${appUrl}/dashboard/success?checkout=success&skuId=${encodeURIComponent(
      skuId
    )}&session_id={CHECKOUT_SESSION_ID}`;
    if (sku.is_active) return NextResponse.json({ url: successSkuUrl });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: STRIPE_PRICES.skuActivationOneTimeUsd19, quantity: 1 }],
      success_url: successSkuUrl,
      cancel_url,
      metadata: {
        type: "sku",
        user_id: user.id,
        sku_id: skuId
      }
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    const e = error as any;
    console.error("[stripe checkout] POST failed", {
      message: e?.message,
      type: e?.type,
      name: e?.name,
      code: e?.code,
      statusCode: e?.statusCode,
      // Helpful when Stripe returns a structured error object.
      raw: e
    });

    // Always return a safe response to the client; real details are in server logs.
    return NextResponse.json(
      { error: "Stripe checkout failed", type: e?.type, message: e?.message },
      { status: 500 }
    );
  }
}

