/**
 * Removes leading "8.", "8)", "8 -" style prefixes from stored step names so the
 * print layout can show "Step 08" + "Final Assembly" without "8. Final Assembly".
 */
export function stripLeadingStepNumberFromTitle(raw: string): string {
  const t = raw.trim();
  const next = t.replace(/^\s*\d+\s*[.)\-–:]\s*/u, "").trim();
  return next.length > 0 ? next : t;
}
