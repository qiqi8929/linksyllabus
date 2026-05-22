import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { getBluebookStripePriceId } from "@/lib/stripe/bluebookSubscription";
import { env } from "@/lib/env";
import { BLUEBOOK_SUBSCRIPTION } from "@/lib/bluebook/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stripe = getStripe();
  const admin = createSupabaseAdminClient();
  await admin.from("users").upsert({ id: user.id, email: user.email });

  const { data: subRow } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = subRow?.stripe_customer_id?.trim();
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id }
    });
    customerId = customer.id;
    await admin.from("subscriptions").upsert({
      user_id: user.id,
      stripe_customer_id: customerId,
      status: "inactive"
    });
  }

  const appUrl = env.appUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    allow_promotion_codes: true,
    line_items: [{ price: getBluebookStripePriceId(), quantity: 1 }],
    subscription_data: {
      trial_period_days: BLUEBOOK_SUBSCRIPTION.trialDays,
      metadata: { user_id: user.id }
    },
    success_url: `${appUrl}/bluebook/onboarding?checkout=success`,
    cancel_url: `${appUrl}/bluebook/onboarding?checkout=cancel`,
    metadata: {
      type: "bluebook_subscription",
      user_id: user.id
    }
  });

  return NextResponse.json({ url: session.url });
}
