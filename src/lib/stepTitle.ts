/**
 * Removes leading "8.", "8)", "8 -" style prefixes from stored step names so the
 * print layout can show "Step 08" + "Final Assembly" without "8. Final Assembly".
 */
export function stripLeadingStepNumberFromTitle(raw: string): string {
  const t = raw.trim();
  const next = t.replace(/^\s*\d+\s*[.)\-–:]\s*/u, "").trim();
  return next.length > 0 ? next : t;
}

/** Removes "Time Segment" / time-segment artifacts that models sometimes append to titles. */
export function stripTimeSegmentFromStepTitle(raw: string): string {
  let s = raw.trim();
  s = s.replace(/\btime\s+segment\b/gi, "");
  s = s.replace(/\s*[-–—]\s*time\s+segment\b/gi, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

/** Step list / tutorial UI: clean stored titles for display (DB may contain old AI suffixes). */
export function formatStepNameForDisplay(raw: string): string {
  return stripTimeSegmentFromStepTitle(stripLeadingStepNumberFromTitle(raw));
}
