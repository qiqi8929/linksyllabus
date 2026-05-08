"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] error.tsx (client)", {
      digest: error.digest,
      message: error.message,
      name: error.name,
      stack: error.stack
    });
  }, [error]);

  return (
    <div className="card max-w-lg space-y-4 p-6">
      <h2 className="text-lg font-semibold text-zinc-900">Dashboard error</h2>
      <p className="text-sm text-zinc-600">
        Something went wrong while loading this screen. You can try again, or go back to the home
        page. In production, Next.js hides the underlying message in the browser; check the browser
        console for <span className="font-mono text-xs">[dashboard] error.tsx</span> or Vercel
        function logs and match the reference below.
      </p>
      {error.digest ? (
        <p className="text-xs font-mono text-zinc-500 break-all">Reference: {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <a className="btn-ghost inline-flex items-center" href="/">
          Home
        </a>
      </div>
    </div>
  );
}
