// deploy-bump: new commit triggers a fresh Vercel build; for cache-free redeploy, use Dashboard → Redeploy → uncheck build cache.

/** Default Gemini model for `generateContent` (`models/{id}` path segment). Override with `GEMINI_MODEL` (e.g. on Vercel). */
export const GEMINI_MODEL_ID = "gemini-2.5-flash";

export const env = {
  // 这些 NEXT_PUBLIC_* 变量会在构建时被 Next.js 内联到前端代码里，
  // 所以这里不要用动态的 process.env[name] 访问方式。
  /** Public site URL; falls back to VERCEL_URL on Vercel when NEXT_PUBLIC_APP_URL is unset. */
  appUrl: (): string => {
    const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (explicit) return explicit;
    const vercel = process.env.VERCEL_URL?.trim();
    if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;
    return "";
  },

  supabase: {
    url: () => process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    anonKey: () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    // 仅在服务端使用
    serviceRoleKey: () => {
      const v = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!v) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
      return v;
    }
  },

  stripe: {
    // 允许 stripe 未配置（支付被禁用时不需要）
    secretKey: () => process.env.STRIPE_SECRET_KEY as string | undefined,
    webhookSecret: () => process.env.STRIPE_WEBHOOK_SECRET as string | undefined,
    publishableKey: () => process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string | undefined,
    /** One-time SKU activation / publish (~$9.99); overrides default in `stripe/prices.ts` when set. */
    priceIdSkuActivation: () =>
      process.env.STRIPE_PRICE_ID_SKU_ACTIVATION as string | undefined,
    /** One-time payment per additional tutorial guide after free tier ($9.99). */
    priceIdGuideUnlock: () =>
      process.env.STRIPE_PRICE_ID_GUIDE_UNLOCK as string | undefined,
    /** Magic Log subscription ($19.99/mo after trial). Set MAGICLOG_STRIPE_PRICE_ID in Vercel. */
    priceIdMagicLogMonthly: () =>
      (process.env.MAGICLOG_STRIPE_PRICE_ID as string | undefined) ??
      (process.env.STRIPE_PRICE_ID_BLUEBOOK_MONTHLY as string | undefined)
  },

  /** Server-only. Step description generation via Gemini; omit in env to disable AI. */
  geminiApiKey: () => process.env.GEMINI_API_KEY as string | undefined,

  /**
   * Server-only. Model id for `generateContent` paths (`models/{id}`), without the `models/` prefix.
   * Defaults to {@link GEMINI_MODEL_ID}; set `GEMINI_MODEL` in hosting (recommended on Vercel) to match.
   */
  geminiModel: (): string => {
    const v = process.env.GEMINI_MODEL?.trim();
    return v || GEMINI_MODEL_ID;
  },

  /**
   * Optional. YouTube Data API v3 key (server-only).
   * Enables `captions.list` to discover track languages, then we fetch timedtext with those params.
   * Downloading caption files via `captions.download` still requires OAuth; we do not use it here.
   */
  youtubeDataApiKey: () => process.env.YOUTUBE_API_KEY as string | undefined
  ,

  cloudflareStream: {
    accountId: () => process.env.CLOUDFLARE_ACCOUNT_ID as string | undefined,
    apiToken: () => process.env.CLOUDFLARE_STREAM_API_TOKEN as string | undefined,
    customerSubdomain: () =>
      process.env.CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN as string | undefined
  },

  email: {
    smtpHost: () => process.env.SMTP_HOST as string | undefined,
    smtpPort: () => process.env.SMTP_PORT as string | undefined,
    smtpUser: () => process.env.SMTP_USER as string | undefined,
    smtpPass: () => process.env.SMTP_PASS as string | undefined,
    from: () => process.env.EMAIL_FROM as string | undefined
  },

  landing: {
    /** Optional full iframe URL for homepage hero (highest priority). */
    heroStreamIframeUrl: () =>
      process.env.NEXT_PUBLIC_LANDING_HERO_STREAM_IFRAME_URL as string | undefined,
    /**
     * Optional Cloudflare Stream video id for homepage hero.
     * When set together with CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN, homepage hero iframe
     * switches from the legacy YouTube embed to this Stream video.
     */
    heroStreamVideoId: () =>
      process.env.NEXT_PUBLIC_LANDING_HERO_STREAM_VIDEO_ID as string | undefined
  }
};
