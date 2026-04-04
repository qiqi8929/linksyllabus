const TIMEDTEXT_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept-Language": "en-US,en;q=0.9"
};

export type TranscriptCue = {
  text: string;
  /** Start time in seconds from video start */
  start: number;
  /** Duration in seconds */
  duration: number;
};

type Json3Seg = { utf8?: string };
type Json3Event = {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Json3Seg[];
  /** Continuation line: append to previous caption */
  aAppend?: number;
};

type Json3Root = {
  events?: Json3Event[];
};

function timedtextUrl(videoId: string, withLangEn: boolean): string {
  const u = new URL("https://www.youtube.com/api/timedtext");
  u.searchParams.set("v", videoId);
  u.searchParams.set("fmt", "json3");
  if (withLangEn) {
    u.searchParams.set("lang", "en");
  }
  return u.toString();
}

function concatSegText(segs: Json3Seg[] | undefined): string {
  if (!segs?.length) return "";
  return segs.map((s) => s.utf8 ?? "").join("");
}

/**
 * Parse YouTube timedtext `fmt=json3` body into cues (seconds).
 */
function parseJson3ToCues(data: Json3Root): TranscriptCue[] {
  const events = data.events ?? [];
  const cues: TranscriptCue[] = [];

  for (const ev of events) {
    const piece = concatSegText(ev.segs).replace(/\u200b/g, "").trim();
    if (!piece) continue;

    const startMs = ev.tStartMs ?? 0;
    const durMs = ev.dDurationMs ?? 0;
    const start = startMs / 1000;
    const duration = durMs / 1000;

    if (ev.aAppend === 1 && cues.length > 0) {
      const prev = cues[cues.length - 1];
      prev.text = `${prev.text} ${piece}`.trim();
      if (duration > 0) {
        const end = start + duration;
        const prevEnd = prev.start + prev.duration;
        if (end > prevEnd) prev.duration = end - prev.start;
      }
      continue;
    }

    cues.push({
      text: piece,
      start,
      duration: duration > 0 ? duration : 0
    });
  }

  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (c.duration <= 0 && i < cues.length - 1) {
      const nextStart = cues[i + 1].start;
      c.duration = Math.max(0.1, nextStart - c.start);
    }
  }
  if (cues.length > 0) {
    const last = cues[cues.length - 1];
    if (last.duration <= 0) last.duration = 2;
  }

  return cues;
}

async function fetchTimedtextJson3(
  videoId: string,
  withLangEn: boolean
): Promise<{ ok: boolean; data: Json3Root | null }> {
  const res = await fetch(timedtextUrl(videoId, withLangEn), {
    headers: TIMEDTEXT_HEADERS
  });
  if (!res.ok) {
    return { ok: false, data: null };
  }
  const text = await res.text();
  if (!text.trim()) {
    return { ok: true, data: null };
  }
  try {
    const data = JSON.parse(text) as Json3Root;
    return { ok: true, data };
  } catch {
    return { ok: true, data: null };
  }
}

function cuesUsable(cues: TranscriptCue[]): boolean {
  return cues.some((c) => c.text.length > 0);
}

/**
 * Fetch YouTube captions as timed segments via the timedtext API (no third-party scraper).
 * Tries English first, then default track without `lang`.
 */
export async function getTranscript(videoId: string): Promise<TranscriptCue[]> {
  const id = videoId.trim();
  if (!id) {
    throw new Error("Video id is required.");
  }

  const tryEn = await fetchTimedtextJson3(id, true);
  if (tryEn.data) {
    const cues = parseJson3ToCues(tryEn.data);
    if (cuesUsable(cues)) return cues;
  }

  const tryDefault = await fetchTimedtextJson3(id, false);
  if (!tryDefault.data) {
    throw new Error(
      "No transcript available for this video (timedtext API returned no JSON)."
    );
  }
  const cues = parseJson3ToCues(tryDefault.data);
  if (!cuesUsable(cues)) {
    throw new Error("No transcript lines found for this video.");
  }
  return cues;
}
