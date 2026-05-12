/**
 * Absolute site origin for QR codes and redirects.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_APP_URL` (if set AND `https://...`) — primary source in
 *      production. Skips request-header detection to guarantee a stable,
 *      public origin no matter what Vercel forwards.
 *   2. `x-forwarded-host` / `x-forwarded-proto` (Vercel edge, preview/branch).
 *   3. `new URL(req.url).origin` — direct origin.
 *   4. `http://localhost:3000` — local dev fallback.
 *
 * Safety net: if the resolved origin still looks like localhost / 127.0.0.1
 * AND `NEXT_PUBLIC_APP_URL` is set, force-return that env value — a QR encoded
 * with a localhost URL is useless to a phone scanner.
 */

const LOCAL_HOST_RE = /(?:^|\/\/)(localhost|127\.0\.0\.1)(?:[:/]|$)/i;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function isLocalhostUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return LOCAL_HOST_RE.test(value);
}

function readPublicAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
}

export function publicSiteOriginFromRequest(req: Request): string {
  const explicit = readPublicAppUrl();

  // 1. Trust an explicit HTTPS env var above everything else. This is what
  //    production deploys rely on; it bypasses any weird forwarded-host header
  //    or proxy chain that might still mention localhost.
  if (explicit && /^https:\/\//i.test(explicit) && !isLocalhostUrl(explicit)) {
    return explicit;
  }

  // 2 + 3. Fall back to request-derived origin only when there's no usable
  //        env override. This keeps local dev working without env vars.
  let resolved = "";

  const fwdHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const fwdProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (fwdHost) {
    const proto =
      fwdProto === "http" || fwdProto === "https" ? fwdProto : "https";
    resolved = `${proto}://${fwdHost}`;
  } else {
    try {
      const { origin } = new URL(req.url);
      if (origin?.startsWith("http")) {
        resolved = trimTrailingSlash(origin);
      }
    } catch {
      /* ignore */
    }
  }

  // 4. Last resort.
  if (!resolved) {
    resolved = explicit || "http://localhost:3000";
  }

  // Hard safety net: never let a localhost origin escape if we have a real
  // public override available.
  if (isLocalhostUrl(resolved)) {
    if (explicit && !isLocalhostUrl(explicit)) {
      console.warn(
        "QR encoding localhost — forced to NEXT_PUBLIC_APP_URL"
      );
      return explicit;
    }
    console.warn(
      `WARNING: QR code encoding localhost URL — check NEXT_PUBLIC_APP_URL env var (resolved="${resolved}")`
    );
  }

  return resolved;
}
