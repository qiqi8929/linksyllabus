import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./bluebook.css";

export default async function BluebookLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/bluebook/dashboard");
  }

  return (
    <div className="bluebook-root min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/bluebook/dashboard" className="text-sm font-semibold text-zinc-900">
            My Bluebook
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/bluebook/dashboard" className="text-zinc-600 hover:text-zinc-900">
              Dashboard
            </Link>
            <Link href="/bluebook/new" className="text-zinc-600 hover:text-zinc-900">
              New work order
            </Link>
            <Link href="/bluebook/export" className="text-zinc-600 hover:text-zinc-900">
              Export
            </Link>
            <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-800">
              Guides
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
