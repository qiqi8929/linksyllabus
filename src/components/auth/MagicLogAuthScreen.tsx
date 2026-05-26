"use client";

import Link from "next/link";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { FormError } from "@/components/FormError";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import { EmailAuthForm } from "@/components/auth/EmailAuthForm";
import { buildOAuthCallbackUrl } from "@/lib/magiclog/oauthCallback";

type MagicLogAuthScreenProps = {
  mode: "signup" | "login";
  nextPath: string;
  initialError?: string | null;
};

export function MagicLogAuthScreen({
  mode,
  nextPath,
  initialError = null
}: MagicLogAuthScreenProps) {
  const [showEmail, setShowEmail] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError === "oauth"
      ? "Google sign-in failed. Please try again or use email."
      : initialError
  );

  const alternateHref =
    mode === "signup"
      ? nextPath !== "/dashboard"
        ? `/login?next=${encodeURIComponent(nextPath)}`
        : "/login"
      : nextPath !== "/dashboard"
        ? `/signup?next=${encodeURIComponent(nextPath)}`
        : "/signup";

  async function continueWithGoogle() {
    setError(null);
    setOauthLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = buildOAuthCallbackUrl(window.location.origin, nextPath);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo }
      });
      if (oauthError) throw oauthError;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setOauthLoading(false);
    }
  }

  return (
    <div className="ml-auth-screen">
      <h1 className="ml-auth-brand">Magic Log</h1>

      <button
        type="button"
        className="ml-auth-google-btn"
        disabled={oauthLoading}
        onClick={() => void continueWithGoogle()}
      >
        <GoogleIcon />
        {oauthLoading ? "Redirecting…" : "Continue with Google"}
      </button>

      <FormError message={error} />

      {!showEmail ? (
        <button
          type="button"
          className="ml-auth-email-link"
          onClick={() => setShowEmail(true)}
        >
          Or continue with email →
        </button>
      ) : (
        <EmailAuthForm mode={mode} nextPath={nextPath} />
      )}

      <p className="ml-auth-legal">
        By continuing, you accept Magic Log&apos;s{" "}
        <Link href="/privacy">Terms of Service</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <p className="ml-auth-alt">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href={alternateHref}>Log in</Link>
          </>
        ) : (
          <>
            Don&apos;t have an account?{" "}
            <Link href={alternateHref}>Sign up</Link>
          </>
        )}
      </p>
    </div>
  );
}
