import { redirect } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/dashboard/serverActions";

/** Cookies/session require request-time rendering; avoids static prerender + DYNAMIC_SERVER_USAGE. */
export const dynamic = "force-dynamic";

function isDynamicServerUsageError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    (e as { digest?: string }).digest === "DYNAMIC_SERVER_USAGE"
  );
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let user: { email?: string | null } | null = null;
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error("[dashboard/layout] getUser error", {
        message: error.message,
        name: error.name
      });
    }
    user = data.user;
  } catch (e) {
    if (isDynamicServerUsageError(e)) throw e;
    console.error("[dashboard/layout] auth failed", e);
    return (
      <div className="container-page py-8">
        <div className="card max-w-lg space-y-3 p-6">
          <h1 className="text-lg font-semibold text-zinc-900">Dashboard unavailable</h1>
          <p className="text-sm text-zinc-600">
            We could not connect to the app backend. Check Vercel env for{" "}
            <code className="rounded bg-zinc-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="rounded bg-zinc-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then
            redeploy.
          </p>
          <Link className="btn-primary inline-block" href="/">
            Home
          </Link>
        </div>
      </div>
    );
  }

  if (!user) redirect("/login");

  return (
    <div>
      <header className="border-b border-zinc-200 bg-white">
        <div className="container-page flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="hidden text-xs text-zinc-500 md:block">{user.email}</div>
          </div>
          <div className="flex items-center gap-2">
            <Link className="btn-ghost" href="/dashboard">
              Dashboard
            </Link>
            <form action={signOutAction}>
              <button className="btn-danger" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="container-page py-8">{children}</main>
    </div>
  );
}
