import { redirect } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/dashboard/serverActions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

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
            <Link className="btn-ghost" href="/dashboard/new">
              Add New Tutorial
            </Link>
            <form action={signOutAction}>
              <button className="btn-danger" type="submit">
                退出
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="container-page py-8">{children}</main>
    </div>
  );
}

