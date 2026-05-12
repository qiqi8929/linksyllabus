/**
 * A step has a "real" video timestamp when it points to a specific moment in
 * the source video. We treat `start_time` > 0 OR a valid clip window
 * (`end_time` > `start_time`) as a real timestamp. A step with both fields at
 * 0 / falsy plays from the beginning of the video; the UI flags that case so
 * viewers know upfront.
 */
export function hasStepTimestamp(step: {
  start_time?: number | null;
  end_time?: number | null;
}): boolean {
  const start = Number(step.start_time) || 0;
  const end = Number(step.end_time) || 0;
  if (start > 0) return true;
  if (end > start && end > 0) return true;
  return false;
}
