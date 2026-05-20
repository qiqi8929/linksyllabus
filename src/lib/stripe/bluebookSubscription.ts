import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

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
