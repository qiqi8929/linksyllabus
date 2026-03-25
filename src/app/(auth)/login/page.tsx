"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { FormError } from "@/components/FormError";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = search.get("next") || "/dashboard";

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
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (signInError) throw signInError;
      router.replace(nextPath);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-6">
      <h1 className="text-lg font-semibold">登录</h1>
      <p className="mt-1 text-sm text-zinc-600">使用邮箱 + 密码登录后进入 dashboard。</p>

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
          {loading ? "登录中..." : "登录"}
        </button>
      </form>

      <div className="mt-4 text-sm text-zinc-600">
        没有账号？{" "}
        <Link className="font-medium text-brand hover:underline" href="/signup">
          去注册
        </Link>
      </div>
    </div>
  );
}

