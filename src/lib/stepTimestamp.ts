const MIN_CLIP_SEC = 15;

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

export type StepClipRow = {
  step_number: number;
  start_time?: number | null;
  end_time?: number | null;
};

export type PlaybackClip = {
  startTime: number;
  endTime: number | null;
  /** DB timestamps extend past the real YouTube/video length. */
  timestampBeyondVideo: boolean;
  videoDurationSec: number | null;
};

/** Clamp a clip so start/end never exceed the source video length. */
export function clampPlaybackClipToDuration(
  startTime: number,
  endTime: number | null,
  videoDurationSec: number | null | undefined
): PlaybackClip {
  const rawStart = Math.max(0, Math.floor(startTime));
  const rawEnd = endTime != null ? Math.floor(endTime) : null;

  if (
    videoDurationSec == null ||
    !Number.isFinite(videoDurationSec) ||
    videoDurationSec <= 0
  ) {
    return {
      startTime: rawStart,
      endTime: rawEnd != null && rawEnd > rawStart ? rawEnd : null,
      timestampBeyondVideo: false,
      videoDurationSec: null
    };
  }

  const dur = Math.floor(videoDurationSec);
  const beyond =
    rawStart >= dur || (rawEnd != null && rawEnd > dur) || rawStart >= dur - 1;

  let start = Math.min(rawStart, Math.max(0, dur - MIN_CLIP_SEC));
  let end = rawEnd;
  if (end != null) {
    end = Math.min(end, dur);
    if (end <= start) end = Math.min(dur, start + MIN_CLIP_SEC);
  } else if (start > dur - MIN_CLIP_SEC) {
    start = Math.max(0, dur - MIN_CLIP_SEC);
    end = dur;
  }

  return {
    startTime: start,
    endTime: end != null && end > start ? end : null,
    timestampBeyondVideo: beyond,
    videoDurationSec: dur
  };
}

/** Normalized clip start and optional end (`null` = no end cap). */
export function resolveStepClipBounds(step: StepClipRow): {
  start: number;
  end: number | null;
  hasClipEnd: boolean;
} {
  const start = Math.max(0, Math.floor(Number(step.start_time) || 0));
  const endRaw = Math.floor(Number(step.end_time) || 0);
  const hasClipEnd = endRaw > start;
  return { start, end: hasClipEnd ? endRaw : null, hasClipEnd };
}

/**
 * Playback bounds for a step, inferring from sibling steps when this row has no
 * valid clip window (common for steps 7–8 when AI only filled the first half).
 */
export function resolvePlaybackClipForStep(
  step: StepClipRow,
  siblingsInOrder: StepClipRow[],
  videoDurationSec?: number | null
): PlaybackClip {
  const direct = resolveStepClipBounds(step);
  if (direct.hasClipEnd) {
    return clampPlaybackClipToDuration(direct.start, direct.end, videoDurationSec);
  }

  const sorted = [...siblingsInOrder].sort((a, b) => a.step_number - b.step_number);
  const idx = sorted.findIndex((s) => s.step_number === step.step_number);
  if (idx < 0) {
    return clampPlaybackClipToDuration(direct.start, null, videoDurationSec);
  }

  let anchorIdx = -1;
  let anchorEnd = 0;
  for (let i = idx - 1; i >= 0; i--) {
    const b = resolveStepClipBounds(sorted[i]);
    if (b.hasClipEnd) {
      anchorIdx = i;
      anchorEnd = b.end!;
      break;
    }
    const st = Math.max(0, Math.floor(Number(sorted[i].start_time) || 0));
    if (st > anchorEnd) {
      anchorIdx = i;
      anchorEnd = st;
      break;
    }
  }

  let nextAnchorIdx = sorted.length;
  let nextAnchorStart: number | null = null;
  for (let i = idx + 1; i < sorted.length; i++) {
    const b = resolveStepClipBounds(sorted[i]);
    const st = Math.max(0, Math.floor(Number(sorted[i].start_time) || 0));
    if (b.hasClipEnd && b.start > anchorEnd) {
      nextAnchorIdx = i;
      nextAnchorStart = b.start;
      break;
    }
    if (st > anchorEnd) {
      nextAnchorIdx = i;
      nextAnchorStart = st;
      break;
    }
  }

  const blockStart = anchorIdx + 1;
  const block = sorted.slice(blockStart, nextAnchorIdx);
  const posInBlock = block.findIndex((s) => s.step_number === step.step_number);
  if (posInBlock < 0) {
    return clampPlaybackClipToDuration(Math.max(direct.start, anchorEnd), null, videoDurationSec);
  }

  const regionEnd =
    nextAnchorStart != null
      ? nextAnchorStart
      : anchorEnd + Math.max(block.length, 1) * 60;
  const regionStart = anchorEnd;
  const span = Math.max(regionEnd - regionStart, block.length * MIN_CLIP_SEC);
  const chunk = Math.max(MIN_CLIP_SEC, Math.floor(span / block.length));
  const startTime = regionStart + posInBlock * chunk;
  const isLastInBlock = posInBlock === block.length - 1;
  const endTime = isLastInBlock
    ? Math.max(regionEnd, startTime + MIN_CLIP_SEC)
    : Math.min(startTime + chunk, regionEnd);

  return clampPlaybackClipToDuration(startTime, endTime, videoDurationSec);
}

/** Cap stored step clips to the real video length (fixes AI/transcript overrun). */
export function clampStepClipsMapToVideoDuration(
  clips: Map<number, { start_time: number; end_time: number }>,
  videoDurationSec: number
): Map<number, { start_time: number; end_time: number }> {
  const dur = Math.floor(videoDurationSec);
  if (dur <= 0) return clips;

  const out = new Map<number, { start_time: number; end_time: number }>();
  const nums = [...clips.keys()].sort((a, b) => a - b);
  for (const n of nums) {
    const c = clips.get(n)!;
    let start_time = Math.max(0, Math.min(Math.floor(c.start_time), dur - MIN_CLIP_SEC));
    let end_time = Math.min(Math.floor(c.end_time), dur);
    if (end_time <= start_time) {
      start_time = Math.max(0, dur - MIN_CLIP_SEC);
      end_time = dur;
    }
    if (start_time >= dur) continue;
    out.set(n, { start_time, end_time });
  }
  return out;
}

/**
 * After Gemini transcript mapping, fill steps that were skipped and chain clip
 * ends to the next step's start when possible.
 */
export function fillMissingStepClipsAfterAi(params: {
  steps: Array<{ step_number: number }>;
  clips: Map<number, { start_time: number; end_time: number }>;
  videoDurationSec?: number;
}): Map<number, { start_time: number; end_time: number }> {
  const { steps, clips, videoDurationSec } = params;
  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);
  const out = new Map(clips);

  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = out.get(sorted[i].step_number);
    const next = out.get(sorted[i + 1].step_number);
    if (!cur || !next) continue;
    if (next.start_time > cur.start_time) {
      cur.end_time = next.start_time;
      if (cur.end_time - cur.start_time < MIN_CLIP_SEC) {
        cur.end_time = cur.start_time + MIN_CLIP_SEC;
      }
    }
  }

  const missing = sorted.filter((s) => !out.has(s.step_number));
  if (missing.length === 0) return out;

  let anchorEnd = 0;
  for (const s of sorted) {
    if (missing.some((m) => m.step_number === s.step_number)) break;
    const c = out.get(s.step_number);
    if (c) anchorEnd = Math.max(anchorEnd, c.end_time);
  }

  const knownMaxEnd = Math.max(0, ...[...out.values()].map((c) => c.end_time));
  const duration =
    videoDurationSec != null && Number.isFinite(videoDurationSec) && videoDurationSec > 0
      ? Math.floor(videoDurationSec)
      : Math.max(
          knownMaxEnd + missing.length * MIN_CLIP_SEC,
          anchorEnd + missing.length * MIN_CLIP_SEC,
          720
        );

  let cursor = Math.max(anchorEnd, knownMaxEnd);
  const remaining = Math.max(duration - cursor, missing.length * MIN_CLIP_SEC);
  const chunk = Math.max(MIN_CLIP_SEC, Math.floor(remaining / missing.length));

  for (let i = 0; i < missing.length; i++) {
    const s = missing[i];
    const start_time = cursor;
    const isLast = i === missing.length - 1;
    let end_time = isLast ? duration : Math.min(start_time + chunk, duration);
    end_time = Math.max(end_time, start_time + MIN_CLIP_SEC);
    out.set(s.step_number, { start_time, end_time });
    cursor = end_time;
  }

  if (videoDurationSec != null && Number.isFinite(videoDurationSec) && videoDurationSec > 0) {
    return clampStepClipsMapToVideoDuration(out, videoDurationSec);
  }
  return out;
}
