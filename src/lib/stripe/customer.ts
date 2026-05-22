import type Stripe from "stripe";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export function isStaleStripeCustomerError(err: unknown): boolean {
  const e = err as { type?: string; code?: string; message?: string; param?: string };
  if (e?.type !== "StripeInvalidRequestError") return false;
  if (/no such customer/i.test(String(e?.message ?? ""))) return true;
  return e?.code === "resource_missing" && e?.param === "customer";
}

export async function getOrCreateStripeCustomerId(
  stripe: Stripe,
  admin: AdminClient,
  user: { id: string; email?: string | null }
): Promise<string> {
  const { data: row } = await admin
    .from("subscriptions")
    .select("stripe_customer_id,status")
    .eq("user_id", user.id)
    .maybeSingle();

  const existing = row?.stripe_customer_id?.trim();
  if (existing) {
    try {
      const found = await stripe.customers.retrieve(existing);
      if (!("deleted" in found && found.deleted)) {
        return existing;
      }
    } catch (e) {
      if (!isStaleStripeCustomerError(e)) {
        throw e;
      }
    }
    await admin
      .from("subscriptions")
      .update({ stripe_customer_id: null })
      .eq("user_id", user.id);
  }

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: { user_id: user.id }
  });
  await admin.from("subscriptions").upsert({
    user_id: user.id,
    stripe_customer_id: customer.id,
    status: row?.status ?? "inactive"
  });
  return customer.id;
}
