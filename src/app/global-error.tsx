"use client";

/**
 * Root-level fallback when the root layout fails. Must include html/body.
 * https://nextjs.org/docs/app/building-your-application/routing/error-handling
 */
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white font-sans antialiased">
        <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
          <h1 className="text-lg font-semibold text-zinc-900">Application error</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Please reload the page. If the problem continues, share this reference with support.
          </p>
          {error.digest ? (
            <p className="mt-4 rounded-md bg-zinc-100 px-3 py-2 font-mono text-xs text-zinc-700 break-all">
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            className="mt-6 rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            onClick={() => reset()}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
