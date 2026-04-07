"use client";

import Link from "next/link";

export function PrintBar({ tutorialHref }: { tutorialHref: string }) {
  return (
    <div className="pm-print-bar print:hidden">
      <Link className="pm-back-btn" href={tutorialHref}>
        ← Back to tutorial
      </Link>
      <button type="button" className="pm-print-btn" onClick={() => window.print()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <polyline
            points="6 9 6 2 18 2 18 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="6" y="14" width="12" height="8" stroke="currentColor" strokeWidth="2" />
        </svg>
        Print / Save PDF
      </button>
    </div>
  );
}
