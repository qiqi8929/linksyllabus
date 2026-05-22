"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MagicLogLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/magiclog/dashboard";
  const isOnboarding =
    pathname === "/magiclog/onboarding" || pathname.startsWith("/magiclog/onboarding/");

  if (isDashboard) {
    return (
      <div className="magiclog-root ml-dashboard-app min-h-screen bg-[#f0f0f0]">
        {children}
      </div>
    );
  }

  if (isOnboarding) {
    return (
      <div className="magiclog-root min-h-screen bg-zinc-50">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center px-4 py-3">
            <Link href="/" className="text-sm font-semibold text-zinc-900">
              Magic Log
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </div>
    );
  }

  return (
    <div className="magiclog-root min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/magiclog/dashboard" className="text-sm font-semibold text-zinc-900">
            Magic Log
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/magiclog/dashboard" className="text-zinc-600 hover:text-zinc-900">
              Dashboard
            </Link>
            <Link href="/magiclog/new" className="text-zinc-600 hover:text-zinc-900">
              New work order
            </Link>
            <Link href="/magiclog/export" className="text-zinc-600 hover:text-zinc-900">
              Export
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
