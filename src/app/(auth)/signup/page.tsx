"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { FormError } from "@/components/FormError";

export default function SignupPage() {
  const router = useRouter();
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
      }

      router.replace("/dashboard");
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
      <p className="mt-1 text-sm text-zinc-600">After signing up, you will be redirected to the dashboard.</p>

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
        <Link className="font-medium text-brand hover:underline" href="/login">
          Log in
        </Link>
      </div>
    </div>
  );
}

