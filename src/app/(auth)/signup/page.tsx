"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { FormError } from "@/components/FormError";

function safeNextPath(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next")) ?? "/dashboard";
  const isMagicLogSignup = nextPath.startsWith("/magiclog");
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password
      });
      if (signUpError) throw signUpError;

      // Create a matching row in public.users (RLS allows self insert)
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
        // Best-effort notification; never block successful signup.
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

      router.replace(nextPath);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Sign up failed");
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

        <button className="btn-primary w-full" disabled={loading} type="submit">
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <div className="mt-4 text-sm text-zinc-600">
        Already have an account?{" "}
        <Link
          className="font-medium text-brand hover:underline"
          href={nextPath !== "/dashboard" ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"}
        >
          Log in
        </Link>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="card p-6 text-sm text-zinc-600">Loading…</div>}>
      <SignupForm />
    </Suspense>
  );
}

