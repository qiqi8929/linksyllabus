"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { FormError } from "@/components/FormError";
import { resolvePostAuthRedirectClient } from "@/lib/magiclog/resolvePostAuthRedirectClient";

type EmailAuthFormProps = {
  mode: "signup" | "login";
  nextPath: string;
};

export function EmailAuthForm({ mode, nextPath }: EmailAuthFormProps) {
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
      if (mode === "signup") {
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
        if (!sessionData.session) {
          setInfo(
            "Account created. Check your email to confirm, then log in to continue."
          );
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (signInError) throw signInError;
      }

      const destination = await resolvePostAuthRedirectClient(nextPath);
      window.location.assign(destination);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ml-auth-email-panel">
      <h2>{mode === "signup" ? "Sign up with email" : "Log in with email"}</h2>
      <p>
        {mode === "signup"
          ? "Create an account with your email and password."
          : "Use the email and password for your existing account."}
      </p>

      <form className="space-y-3" onSubmit={onSubmit}>
        <div className="space-y-1">
          <label className="text-sm font-medium">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </div>

        <FormError message={error} />
        {info ? <p className="text-sm text-zinc-600">{info}</p> : null}

        <button className="btn-primary w-full" disabled={loading} type="submit">
          {loading
            ? mode === "signup"
              ? "Creating account..."
              : "Signing in..."
            : mode === "signup"
              ? "Create account"
              : "Log in"}
        </button>
      </form>
    </div>
  );
}
