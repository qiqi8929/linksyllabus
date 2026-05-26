"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  MAGICLOG_OAUTH_DEFAULT_NEXT
} from "@/lib/magiclog/oauthCallback";
import { safeNextPath } from "@/lib/magiclog/safeNextPath";

export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      const code = searchParams.get("code");
      const nextParam = safeNextPath(
        searchParams.get("next"),
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
        router.replace(
          `/login?error=oauth&next=${encodeURIComponent(nextParam)}`
        );
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
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-zinc-600">Signing you in…</p>
    </div>
  );
}
