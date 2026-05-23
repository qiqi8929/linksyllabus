import { safeNextPath } from "@/lib/magiclog/safeNextPath";

export const MAGICLOG_OAUTH_DEFAULT_NEXT = "/magiclog/onboarding";

export function buildOAuthCallbackUrl(origin: string, nextPath: string): string {
  const safe = safeNextPath(nextPath, MAGICLOG_OAUTH_DEFAULT_NEXT);
  return `${origin}/auth/callback?next=${encodeURIComponent(safe)}`;
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
