import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getOrCreateStripeCustomerId,
  isStaleStripeCustomerError
} from "@/lib/stripe/customer";
import { getStripe } from "@/lib/stripe/server";
import { STRIPE_PRICES } from "@/lib/stripe/prices";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload =
  | { type: "guide_unlock" }
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

    if (payload.type === "guide_unlock") {
      // Server applies slot on this GET (before dashboard); webhook uses the same idempotent path.
      const success_url = `${appUrl}/api/stripe/guide-unlock-return?session_id={CHECKOUT_SESSION_ID}`;
      let customerId = await getOrCreateStripeCustomerId(stripe, admin, user);

      const createUnlockSession = () =>
        stripe.checkout.sessions.create({
          mode: "payment",
          customer: customerId,
          allow_promotion_codes: true,
          line_items: [{ price: STRIPE_PRICES.guideUnlockOneTimeUsd999, quantity: 1 }],
          success_url,
          cancel_url,
          metadata: {
            type: "guide_unlock",
            user_id: user.id
          }
        });

      try {
        const session = await createUnlockSession();
        return NextResponse.json({
          url: session.url,
          checkoutSessionId: session.id ?? null
        });
      } catch (e) {
        if (!isStaleStripeCustomerError(e)) throw e;
        await admin
          .from("subscriptions")
          .update({ stripe_customer_id: null })
          .eq("user_id", user.id);
        customerId = await getOrCreateStripeCustomerId(stripe, admin, user);
        const session = await createUnlockSession();
        return NextResponse.json({
          url: session.url,
          checkoutSessionId: session.id ?? null
        });
      }
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

    let customerId = await getOrCreateStripeCustomerId(stripe, admin, user);

    const createSkuSession = () =>
      stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        allow_promotion_codes: true,
        line_items: [{ price: STRIPE_PRICES.skuActivationOneTimeUsd999, quantity: 1 }],
        success_url: successSkuUrl,
        cancel_url,
        metadata: {
          type: "sku",
          user_id: user.id,
          sku_id: skuId
        }
      });

    try {
      const session = await createSkuSession();
      return NextResponse.json({ url: session.url });
    } catch (e) {
      if (!isStaleStripeCustomerError(e)) throw e;
      await admin
        .from("subscriptions")
        .update({ stripe_customer_id: null })
        .eq("user_id", user.id);
      customerId = await getOrCreateStripeCustomerId(stripe, admin, user);
      const session = await createSkuSession();
      return NextResponse.json({ url: session.url });
    }
  } catch (error: unknown) {
    const e = error as any;
    console.error("[stripe checkout] POST failed", {
      message: e?.message,
      type: e?.type,
      name: e?.name,
      code: e?.code,
      statusCode: e?.statusCode,
      raw: e
    });

    return NextResponse.json(
      { error: "Stripe checkout failed", type: e?.type, message: e?.message },
      { status: 500 }
    );
  }
}
