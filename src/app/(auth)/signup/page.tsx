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
      setError(err?.message ?? "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-6">
      <h1 className="text-lg font-semibold">注册</h1>
      <p className="mt-1 text-sm text-zinc-600">注册成功后自动进入 dashboard。</p>

      <form className="mt-6 space-y-3" onSubmit={onSubmit}>
        <div className="space-y-1">
          <div className="text-sm font-medium">邮箱</div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium">密码</div>
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
          {loading ? "创建中..." : "创建账号"}
        </button>
      </form>

      <div className="mt-4 text-sm text-zinc-600">
        已有账号？{" "}
        <Link className="font-medium text-brand hover:underline" href="/login">
          去登录
        </Link>
      </div>
    </div>
  );
}

