import { env } from "@/lib/env";

/** Default Stripe Price for one-time tutorial activation ($19.90). */
const DEFAULT_SKU_ACTIVATION_PRICE_ID = "price_1THeafRTASmLgEY5ZM9QXM2f";

export const STRIPE_PRICES = {
  skuActivationOneTimeUsd19:
    env.stripe.priceIdSkuActivation() ?? DEFAULT_SKU_ACTIVATION_PRICE_ID,
  subscriptionMonthlyUsd199: "price_REPLACE_ME_SUB_MONTHLY_199"
} as const;
