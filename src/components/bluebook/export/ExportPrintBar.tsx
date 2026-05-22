"use client";

import Link from "next/link";
import { useEffect } from "react";

export function ExportPrintBar({
  backHref,
  autoPrint = false
}: {
  backHref: string;
  autoPrint?: boolean;
}) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => {
      window.print();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

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
      {autoPrint ? (
        <p className="w-full text-xs text-zinc-500">
          Save as PDF in the print dialog, then upload to MyTradesecrets.
        </p>
      ) : null}
    </section>
  );
}
