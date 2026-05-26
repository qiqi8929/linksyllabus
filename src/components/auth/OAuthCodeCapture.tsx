"use client";

import { useEffect } from "react";
import { stashOAuthNext } from "@/lib/magiclog/oauthNextStorage";
import { MAGICLOG_OAUTH_DEFAULT_NEXT } from "@/lib/magiclog/oauthCallback";

/**
 * Supabase often redirects to Site URL with `?code=` on `/` instead of `/auth/callback`.
 * Forward in the browser so PKCE cookies stay on the same origin/port.
 */
export function OAuthCodeCapture() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (!code || url.pathname === "/auth/callback") return;

    const next =
      url.searchParams.get("next") ?? MAGICLOG_OAUTH_DEFAULT_NEXT;
    stashOAuthNext(next);

    const dest = new URL("/auth/callback", url.origin);
    dest.searchParams.set("code", code);
    dest.searchParams.set("next", next);
    window.location.replace(dest.toString());
  }, []);

  return null;
}
