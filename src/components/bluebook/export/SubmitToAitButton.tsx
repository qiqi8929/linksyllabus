"use client";

import { AIT_MYTRADESECRETS_URL } from "@/lib/bluebook/constants";

export function SubmitToAitButton({ printHref }: { printHref: string }) {
  function handleSubmit() {
    const separator = printHref.includes("?") ? "&" : "?";
    const pdfUrl = `${printHref}${separator}autoprint=1`;
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
    window.open(AIT_MYTRADESECRETS_URL, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="bb-submit-block mt-6 w-full border-t border-zinc-200 pt-5">
      <button
        type="button"
        className="btn-primary bb-submit-ait-btn inline-flex w-full max-w-md justify-center sm:w-auto"
        onClick={handleSubmit}
      >
        Submit to AIT via MyTradesecrets
      </button>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-600">
        <li>Download your signed PDF above</li>
        <li>Log into MyTradesecrets</li>
        <li>Go to Documents tab</li>
        <li>Upload the PDF file (PDF accepted, max 4MB)</li>
        <li>AIT will review and issue your Certificate of Progress</li>
      </ol>
    </div>
  );
}
