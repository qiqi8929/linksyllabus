import { env } from "@/lib/env";

/** Default Stripe Price for one-time tutorial activation ($9.90). */
const DEFAULT_SKU_ACTIVATION_PRICE_ID = "price_REPLACE_ME_SKU_ACTIVATION_99";

export const STRIPE_PRICES = {
  skuActivationOneTimeUsd99:
    env.stripe.priceIdSkuActivation() ?? DEFAULT_SKU_ACTIVATION_PRICE_ID,
  subscriptionMonthlyUsd199: "price_REPLACE_ME_SUB_MONTHLY_199"
} as const;
