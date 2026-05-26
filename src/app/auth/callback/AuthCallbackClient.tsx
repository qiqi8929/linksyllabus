"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  MAGICLOG_OAUTH_DEFAULT_NEXT
} from "@/lib/magiclog/oauthCallback";
import { safeNextPath } from "@/lib/magiclog/safeNextPath";
import { takeOAuthNext } from "@/lib/magiclog/oauthNextStorage";

export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const started = useRef(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      const code = searchParams.get("code");
      const nextParam = safeNextPath(
        searchParams.get("next") ?? takeOAuthNext(),
        MAGICLOG_OAUTH_DEFAULT_NEXT
      );

      if (!code) {
        router.replace(
          `/login?error=oauth&next=${encodeURIComponent(nextParam)}`
        );
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[auth/callback] exchangeCodeForSession failed", error.message);
        setStatusMessage(
          error.message.includes("PKCE")
            ? "Login session expired. Close this tab, open http://localhost:3000 again, and sign in with Google once."
            : "Google sign-in failed. Please try again."
        );
        setTimeout(() => {
          router.replace(
            `/login?error=oauth&next=${encodeURIComponent(nextParam)}`
          );
        }, 4000);
        return;
      }

      try {
        const res = await fetch("/api/auth/post-oauth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ next: nextParam })
        });
        if (!res.ok) throw new Error(`post-oauth ${res.status}`);
        const { destination } = (await res.json()) as { destination: string };
        window.location.assign(destination);
      } catch (err) {
        console.error("[auth/callback] post-oauth failed", err);
        router.replace(
          `/login?error=oauth&next=${encodeURIComponent(nextParam)}`
        );
      }
    })();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-4 text-center">
      <p className="text-zinc-600">{statusMessage ?? "Signing you in…"}</p>
      {statusMessage ? (
        <p className="text-sm text-zinc-500">Redirecting to login…</p>
      ) : null}
    </div>
  );
}
