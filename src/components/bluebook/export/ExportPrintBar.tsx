"use client";

import Link from "next/link";

export function ExportPrintBar({ backHref }: { backHref: string }) {
  return (
    <section className="bb-export-no-print mb-6 flex flex-wrap items-center gap-3">
      <Link href={backHref} className="text-sm text-zinc-600 hover:text-zinc-900">
        ← Back to export
      </Link>
      <button
        type="button"
        className="btn-primary"
        onClick={() => window.print()}
      >
        Print / Save as PDF
      </button>
    </section>
  );
}
