/**
 * Absolute site origin for QR codes and redirects. Prefer the incoming request
 * (matches Vercel / preview / www vs apex) over NEXT_PUBLIC_APP_URL alone.
 */
export function publicSiteOriginFromRequest(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  const fwdHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const fwdProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (fwdHost) {
    const proto =
      fwdProto === "http" || fwdProto === "https" ? fwdProto : "https";
    return `${proto}://${fwdHost}`;
  }

  try {
    const { origin } = new URL(req.url);
    if (origin?.startsWith("http")) {
      return origin.replace(/\/$/, "");
    }
  } catch {
    /* ignore */
  }

  if (explicit) return explicit;
  return "http://localhost:3000";
}
