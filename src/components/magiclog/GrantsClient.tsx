"use client";

import Link from "next/link";
import { grantsForProvince } from "@/lib/magiclog/grants";

export function GrantsClient({ province }: { province: string }) {
  const grants = grantsForProvince(province);

  return (
    <section className="space-y-6">
      <header>
        <Link href="/magiclog/dashboard" className="text-xs text-zinc-500 hover:text-zinc-800">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Grants &amp; awards</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Available programs for apprentices in your province. Applications open on the official
          sites.
        </p>
      </header>

      {grants.length === 0 ? (
        <p className="card p-5 text-sm text-zinc-600">
          Grant listings for your province are coming soon. Check your provincial trades portal
          for current funding.
        </p>
      ) : (
        <ul className="space-y-4">
          {grants.map((g) => (
            <li key={g.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{g.title}</h2>
                  <p className="mt-1 text-sm font-medium text-[#1D9E75]">{g.amount}</p>
                  <p className="mt-2 text-sm text-zinc-600">{g.description}</p>
                </div>
                <a
                  href={g.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary shrink-0"
                >
                  Apply →
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
