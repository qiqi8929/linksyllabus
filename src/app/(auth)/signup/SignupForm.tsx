"use client";

import Link from "next/link";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { FormError } from "@/components/FormError";

export function SignupForm({ nextPath }: { nextPath: string }) {
  const isMagicLogSignup = nextPath.startsWith("/magiclog");
  const supabase = createSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password
      });
      if (signUpError) throw signUpError;

      if (data.user) {
        const { error: dbErr } = await supabase
          .from("users")
          .insert({ id: data.user.id, email: data.user.email });
        if (dbErr && dbErr.code !== "23505") {
          throw dbErr;
        }

        const device =
          typeof navigator === "undefined"
            ? "Unknown device"
            : navigator.userAgent || "Unknown device";
        await fetch("/api/notifications/new-signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email: data.user.email,
            device
          })
        }).catch(() => {});
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        // Full navigation so middleware sees auth cookies on protected Magic Log routes.
        window.location.assign(nextPath);
        return;
      }

      setInfo(
        "Account created. Check your email to confirm, then log in to continue."
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-6">
      <h1 className="text-lg font-semibold">Sign up</h1>
      <p className="mt-1 text-sm text-zinc-600">
        {isMagicLogSignup
          ? "After signing up, you will set up your Magic Log profile."
          : "After signing up, you will be redirected to the dashboard."}
      </p>

      <form className="mt-6 space-y-3" onSubmit={onSubmit}>
        <div className="space-y-1">
          <div className="text-sm font-medium">Email</div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium">Password</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={6}
          />
        </div>

        <FormError message={error} />
        {info ? <p className="text-sm text-zinc-600">{info}</p> : null}

        <button className="btn-primary w-full" disabled={loading} type="submit">
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <div className="mt-4 text-sm text-zinc-600">
        Already have an account?{" "}
        <Link
          className="font-medium text-brand hover:underline"
          href={
            nextPath !== "/dashboard"
              ? `/login?next=${encodeURIComponent(nextPath)}`
              : "/login"
          }
        >
          Log in
        </Link>
      </div>
    </div>
  );
}
