"use client";

/**
 * Catches errors in the App Router segment tree (child routes), not root layout.
 * Shows digest so production issues can be matched to Vercel / server logs.
 */
export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container-page flex min-h-[50vh] flex-col items-center justify-center py-16">
      <div className="card max-w-lg space-y-4 p-8">
        <h1 className="text-lg font-semibold text-zinc-900">Something went wrong</h1>
        <p className="text-sm text-zinc-600">
          You can try again. If this keeps happening, share the reference code below with support (it
          matches server logs; it does not contain secrets).
        </p>
        {error.digest ? (
          <p className="rounded-md bg-zinc-100 px-3 py-2 font-mono text-xs text-zinc-700 break-all">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-2">
          <button type="button" className="btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <a className="btn-ghost inline-flex items-center" href="/">
            Home
          </a>
        </div>
      </div>
    </div>
  );
}
