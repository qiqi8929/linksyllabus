import { safeNextPath } from "@/lib/magiclog/safeNextPath";

export const MAGICLOG_OAUTH_DEFAULT_NEXT = "/magiclog/onboarding";

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function trimOrigin(value: string): string {
  return value.trim().replace(/\/$/, "");
}

/**
 * OAuth redirect must match Supabase “Redirect URLs” exactly.
 * In production, prefer NEXT_PUBLIC_APP_URL so a mis-set Supabase Site URL
 * (e.g. localhost) does not win when the allowlist only lists the live domain.
 */
export function resolveOAuthRedirectOrigin(browserOrigin: string): string {
  const browser = trimOrigin(browserOrigin);
  const explicit = trimOrigin(process.env.NEXT_PUBLIC_APP_URL ?? "");

  if (LOCAL_ORIGIN_RE.test(browser)) {
    return browser || explicit || "http://localhost:3000";
  }

  if (explicit && /^https:\/\//i.test(explicit)) {
    return explicit;
  }

  return browser;
}

export function buildOAuthCallbackUrl(origin: string, nextPath: string): string {
  const safe = safeNextPath(nextPath, MAGICLOG_OAUTH_DEFAULT_NEXT);
  const base = resolveOAuthRedirectOrigin(origin);
  return `${base}/auth/callback?next=${encodeURIComponent(safe)}`;
}

/** Build relative redirect path for server components. */
export function oauthCallbackRedirectPath(
  code: string,
  next?: string | null,
  defaultNext = MAGICLOG_OAUTH_DEFAULT_NEXT
): string {
  const safe = safeNextPath(next, defaultNext);
  return `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(safe)}`;
}

/** When Supabase falls back to Site URL, forward `?code=` to /auth/callback. */
export function oauthCallbackRedirectUrl(
  requestUrl: URL,
  defaultNext = MAGICLOG_OAUTH_DEFAULT_NEXT
): URL | null {
  const code = requestUrl.searchParams.get("code");
  if (!code || requestUrl.pathname === "/auth/callback") {
    return null;
  }

  const dest = new URL(
    oauthCallbackRedirectPath(code, requestUrl.searchParams.get("next"), defaultNext),
    requestUrl.origin
  );
  return dest;
}
