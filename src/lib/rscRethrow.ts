/**
 * Errors that must not be caught by broad try/catch in Server Components
 * (otherwise redirects fail and Next shows a generic production digest).
 */

export function isDynamicServerUsageError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    (e as { digest?: string }).digest === "DYNAMIC_SERVER_USAGE"
  );
}

/** Thrown by `redirect()` from `next/navigation`. */
export function isNextRedirectError(e: unknown): boolean {
  const d =
    typeof e === "object" && e !== null && "digest" in e
      ? String((e as { digest?: unknown }).digest ?? "")
      : "";
  return d.startsWith("NEXT_REDIRECT");
}

export function shouldRethrowFromRscCatch(e: unknown): boolean {
  return isDynamicServerUsageError(e) || isNextRedirectError(e);
}
