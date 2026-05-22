import { env } from "@/lib/env";

/** Placeholder until Stripe Dashboard price id is set in env. */
const DEFAULT_SKU_ACTIVATION_PRICE_ID = "price_REPLACE_ME_SKU_ACTIVATION_999";
const DEFAULT_GUIDE_UNLOCK_PRICE_ID = "price_REPLACE_ME_GUIDE_UNLOCK_999";
/** Fallback only when MAGICLOG_STRIPE_PRICE_ID is unset in hosting env. */
const DEFAULT_MAGICLOG_MONTHLY_PRICE_ID = "price_REPLACE_ME_MAGICLOG_1999";

export const STRIPE_PRICES = {
  /** Publish / activate an existing tutorial SKU (one-time). */
  skuActivationOneTimeUsd999:
    env.stripe.priceIdSkuActivation() ?? DEFAULT_SKU_ACTIVATION_PRICE_ID,
  /** Extra guide slot after free tier (one-time $9.99). */
  guideUnlockOneTimeUsd999:
    env.stripe.priceIdGuideUnlock() ??
    env.stripe.priceIdSkuActivation() ??
    DEFAULT_GUIDE_UNLOCK_PRICE_ID,
  /** Set MAGICLOG_STRIPE_PRICE_ID in Vercel/hosting (not hardcoded in repo). */
  magiclogMonthlyUsd1999:
    env.stripe.priceIdMagicLogMonthly() ?? DEFAULT_MAGICLOG_MONTHLY_PRICE_ID
} as const;
