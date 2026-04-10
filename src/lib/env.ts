export const env = {
  // 这些 NEXT_PUBLIC_* 变量会在构建时被 Next.js 内联到前端代码里，
  // 所以这里不要用动态的 process.env[name] 访问方式。
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL as string,

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
    /** One-time SKU activation (~$19.90); overrides default in `stripe/prices.ts` when set. */
    priceIdSkuActivation: () =>
      process.env.STRIPE_PRICE_ID_SKU_ACTIVATION as string | undefined
  },

  /** Server-only. Step description generation via Gemini; omit in env to disable AI. */
  geminiApiKey: () => process.env.GEMINI_API_KEY as string | undefined,

  /**
   * Server-only. Model id for `generateContent` paths (`models/{id}`), without the `models/` prefix.
   * Default is a current preview build. If you set `GEMINI_MODEL` in hosting (e.g. Vercel), do not use
   * deprecated ids such as `gemini-2.0-flash` — Google returns 404 for new API keys.
   */
  geminiModel: (): string => {
    const v = process.env.GEMINI_MODEL?.trim();
    return v || "gemini-2.5-flash-preview-04-17";
  },

  /**
   * Optional. YouTube Data API v3 key (server-only).
   * Enables `captions.list` to discover track languages, then we fetch timedtext with those params.
   * Downloading caption files via `captions.download` still requires OAuth; we do not use it here.
   */
  youtubeDataApiKey: () => process.env.YOUTUBE_API_KEY as string | undefined
};

