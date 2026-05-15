/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: []
  },
  /**
   * Apex → `www` for all requests except real Stripe webhooks (they send `Stripe-Signature`).
   * In Vercel → Project → Domains, turn off the duplicate “redirect apex to www” domain redirect
   * if it is enabled; otherwise that platform rule runs first and can still 307 `/api/stripe/webhook`
   * before this app runs.
   */
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "linksyllabus.com" }],
        missing: [{ type: "header", key: "stripe-signature" }],
        destination: "https://www.linksyllabus.com/:path*",
        permanent: false
      }
    ];
  },
  /** Avoid stale HTML/edge cache so tutorial client bundle updates apply immediately after deploy. */
  async headers() {
    return [
      {
        source: "/tutorial/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate"
          }
        ]
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*"
          }
        ]
      }
    ];
  }
};

export default nextConfig;

