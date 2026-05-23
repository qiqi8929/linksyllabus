"use client";

export default function AuthError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="ml-auth-screen">
      <h1 className="ml-auth-brand">Magic Log</h1>
      <div className="ml-auth-email-panel">
        <h2>Something went wrong</h2>
        <p>Please try again. If this keeps happening, reload the page.</p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-zinc-500">Ref: {error.digest}</p>
        ) : null}
        <button type="button" className="btn-primary mt-4 w-full" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </div>
  );
}
