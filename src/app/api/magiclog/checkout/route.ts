import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getOrCreateStripeCustomerId,
  isStaleStripeCustomerError
} from "@/lib/stripe/customer";
import { getStripe } from "@/lib/stripe/server";
import { describeMagicLogStripePriceConfig } from "@/lib/stripe/magiclogSubscription";
import { env } from "@/lib/env";
import { magiclog_subscription } from "@/lib/magiclog/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req);
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const appUrl = env.appUrl();
    if (!appUrl) {
      return NextResponse.json(
        {
          error:
            "App URL is not configured. Set NEXT_PUBLIC_APP_URL (e.g. https://linksyllabus.com) in Vercel."
        },
        { status: 500 }
      );
    }

    const priceConfig = describeMagicLogStripePriceConfig();
    const priceId = priceConfig.resolvedPriceId;
    if (priceConfig.isPlaceholder || !priceId.startsWith("price_")) {
      return NextResponse.json(
        {
          error:
            "MAGICLOG_STRIPE_PRICE_ID is missing or invalid on the server. Add your Stripe Price ID in Vercel and redeploy.",
          hint: priceConfig
        },
        { status: 500 }
      );
    }

    const stripe = getStripe();
    const admin = createSupabaseAdminClient();
    await admin.from("users").upsert({ id: user.id, email: user.email });

    let customerId = await getOrCreateStripeCustomerId(stripe, admin, {
      id: user.id,
      email: user.email
    });

    const createSession = () =>
      stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        allow_promotion_codes: true,
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
          trial_period_days: magiclog_subscription.trialDays,
          metadata: { user_id: user.id }
        },
        success_url: `${appUrl}/magiclog/onboarding?checkout=success`,
        cancel_url: `${appUrl}/magiclog/onboarding?checkout=cancel`,
        metadata: {
          type: "magiclog_subscription",
          user_id: user.id
        }
      });

    let session;
    try {
      session = await createSession();
    } catch (e) {
      if (!isStaleStripeCustomerError(e)) throw e;
      await admin
        .from("subscriptions")
        .update({ stripe_customer_id: null })
        .eq("user_id", user.id);
      customerId = await getOrCreateStripeCustomerId(stripe, admin, {
        id: user.id,
        email: user.email
      });
      session = await createSession();
    }

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    const e = error as { type?: string; message?: string };
    console.error("[magiclog checkout] POST failed", {
      message: e?.message,
      type: e?.type
    });
    return NextResponse.json(
      {
        error: e?.message ?? "Stripe checkout failed",
        type: e?.type ?? "checkout_error"
      },
      { status: 500 }
    );
  }
}
