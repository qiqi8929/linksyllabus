"use client";

export function PrintBar() {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-3 print:hidden">
      <button
        type="button"
        className="btn-primary"
        onClick={() => window.print()}
      >
        Print / Save as PDF
      </button>
      <span className="text-xs text-zinc-500">
        Use your browser print dialog; choose “Save as PDF” to download.
      </span>
    </div>
  );
}
