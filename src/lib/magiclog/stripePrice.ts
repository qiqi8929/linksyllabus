const FALLBACK_PLACEHOLDER = "price_REPLACE_ME_MAGICLOG_1999";

/** Magic Log Stripe Price ID (Vercel: MAGICLOG_STRIPE_PRICE_ID). */
export function getMagicLogStripePriceId(): string {
  return process.env.MAGICLOG_STRIPE_PRICE_ID?.trim() || FALLBACK_PLACEHOLDER;
}

export function describeMagicLogStripePriceConfig(): {
  resolvedPriceId: string;
  envMagicLogStripePriceId: string | null;
  isPlaceholder: boolean;
} {
  const resolved = getMagicLogStripePriceId();
  const envMagicLog = process.env.MAGICLOG_STRIPE_PRICE_ID?.trim() || null;
  return {
    resolvedPriceId: resolved,
    envMagicLogStripePriceId: envMagicLog,
    isPlaceholder: resolved === FALLBACK_PLACEHOLDER
  };
}
