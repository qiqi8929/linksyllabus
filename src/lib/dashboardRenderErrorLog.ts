/**
 * Logs errors from dashboard Server Components / catch blocks for Vercel.
 * Production client overlays omit the message; digest + stack help correlate logs.
 */

export function logDashboardCatch(context: string, e: unknown): void {
  const digest =
    typeof e === "object" && e !== null && "digest" in e
      ? String((e as { digest?: unknown }).digest ?? "")
      : "";
  const err = e instanceof Error ? e : null;
  console.error(`[dashboard] ${context}`, {
    digest: digest || undefined,
    message: err?.message ?? String(e),
    name: err?.name,
    stack: err?.stack,
    cause: err && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined
  });
}
