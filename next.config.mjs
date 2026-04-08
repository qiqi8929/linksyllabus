/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: []
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
      }
    ];
  }
};

export default nextConfig;

