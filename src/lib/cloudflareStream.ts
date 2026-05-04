const STREAM_ID_RE = /^[A-Za-z0-9_-]{20,}$/;

export function isCloudflareStreamVideoId(value: string): boolean {
  const v = value.trim();
  if (!v || v.includes("://")) return false;
  return STREAM_ID_RE.test(v);
}

export function buildCloudflareIframeUrl(
  customerSubdomain: string,
  videoId: string
): string {
  const sub = customerSubdomain.trim();
  const id = videoId.trim();
  if (!sub) throw new Error("Missing Cloudflare Stream customer subdomain.");
  if (!isCloudflareStreamVideoId(id)) {
    throw new Error("Invalid Cloudflare Stream video id.");
  }
  return `https://${sub}/${encodeURIComponent(id)}/iframe`;
}

/** Public MP4 URL for AI analyzers that require a direct media file URI. */
export function buildCloudflareDownloadUrl(
  customerSubdomain: string,
  videoId: string
): string {
  const sub = customerSubdomain.trim();
  const id = videoId.trim();
  if (!sub) throw new Error("Missing Cloudflare Stream customer subdomain.");
  if (!isCloudflareStreamVideoId(id)) {
    throw new Error("Invalid Cloudflare Stream video id.");
  }
  return `https://${sub}/${encodeURIComponent(id)}/downloads/default.mp4`;
}
