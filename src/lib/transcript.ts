import { fetchTranscript, type TranscriptResponse } from "youtube-transcript";
import { env } from "@/lib/env";

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const TIMEDTEXT_HEADERS: HeadersInit = {
  "User-Agent": BROWSER_USER_AGENT,
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "application/json, text/xml, text/plain, */*"
};

export type TranscriptCue = {
  text: string;
  /** Start time in seconds from video start */
  start: number;
  /** Duration in seconds */
  duration: number;
};

export type TranscriptFetchSource =
  | "youtube-transcript-package"
  | "timedtext-json3"
  | "timedtext-xml"
  | "watch-page-caption-track"
  | "youtubei-caption-track"
  | "youtubei-transcript-panel"
  | "youtube-data-api-guided-timedtext";

export type TranscriptFetchResult = {
  cues: TranscriptCue[];
  source: TranscriptFetchSource;
};

/** Plain console lines for Vercel logs (easier to grep than JSON `tlog` alone). */
function transcriptConsole(message: string, detail?: unknown) {
  if (detail !== undefined) {
    console.log("[transcript]", message, detail);
  } else {
    console.log("[transcript]", message);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tlog(
  videoId: string,
  step: string,
  data: Record<string, unknown> & { error?: unknown }
) {
  const err = data.error;
  const errMsg =
    err instanceof Error
      ? { message: err.message, stack: err.stack, name: err.name }
      : err !== undefined
        ? { value: String(err) }
        : undefined;
  console.log(
    "[transcript]",
    JSON.stringify({
      videoId,
      step,
      ...data,
      ...(errMsg ? { error: errMsg } : {})
    })
  );
}

export type YoutubeFetchContext = {
  /** Sets Referer/Origin to the watch page — improves success on timedtext + caption URLs. */
  videoId?: string;
};

/** Browser-like fetch for YouTube (datacenter / Vercel serverless IPs need realistic headers). */
export function fetchWithYoutubeHeaders(
  input: RequestInfo | URL,
  init?: RequestInit,
  ctx?: YoutubeFetchContext
): Promise<Response> {
  const h = new Headers(init?.headers);
  if (!h.has("User-Agent")) h.set("User-Agent", BROWSER_USER_AGENT);
  if (!h.has("Accept-Language")) h.set("Accept-Language", "en-US,en;q=0.9");
  if (!h.has("Accept")) h.set("Accept", "application/json, text/xml, text/plain, */*");
  if (ctx?.videoId) {
    const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(ctx.videoId)}`;
    if (!h.has("Referer")) h.set("Referer", watch);
    if (!h.has("Origin")) h.set("Origin", "https://www.youtube.com");
  }
  return fetch(input, { ...init, headers: h });
}

function cuesUsable(cues: TranscriptCue[]): boolean {
  return cues.some((c) => c.text.trim().length > 0);
}

/** Package returns offset/duration in mixed units; normalize to seconds. */
function packageRowsToCues(raw: TranscriptResponse[]): TranscriptCue[] {
  const useMs = raw.some((r) => r.offset > 500 || r.duration > 300);
  const scale = useMs ? 1 / 1000 : 1;
  return raw.map((r) => ({
    text: r.text,
    start: r.offset * scale,
    duration: r.duration * scale
  }));
}

async function tryYoutubeTranscriptPackage(
  videoId: string
): Promise<TranscriptFetchResult | null> {
  transcriptConsole("trying youtube-transcript package (npm)...", { videoId });
  try {
    const raw = await fetchTranscript(videoId, {
      fetch: (url, init) => fetchWithYoutubeHeaders(url, init, { videoId })
    });
    if (!raw?.length) {
      transcriptConsole("youtube-transcript package failed: empty rows", { videoId });
      tlog(videoId, "youtube-transcript-package", { ok: false, reason: "empty" });
      return null;
    }
    const cues = packageRowsToCues(raw);
    if (!cuesUsable(cues)) {
      transcriptConsole("youtube-transcript package failed: no usable text in cues", { videoId });
      tlog(videoId, "youtube-transcript-package", { ok: false, reason: "no text" });
      return null;
    }
    transcriptConsole("youtube-transcript package ok", { videoId, cueCount: cues.length });
    tlog(videoId, "youtube-transcript-package", { ok: true, cueCount: cues.length });
    return { cues, source: "youtube-transcript-package" };
  } catch (error: unknown) {
    transcriptConsole("youtube-transcript package failed:", errorMessage(error));
    tlog(videoId, "youtube-transcript-package", { ok: false, error });
    return null;
  }
}

type Json3Seg = { utf8?: string };
type Json3Event = {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Json3Seg[];
  aAppend?: number;
};
type Json3Root = { events?: Json3Event[] };

function concatSegText(segs: Json3Seg[] | undefined): string {
  if (!segs?.length) return "";
  return segs.map((s) => s.utf8 ?? "").join("");
}

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

/** Query variants for `https://www.youtube.com/api/timedtext` (manual + ASR + a few locales). */
const TIMEDTEXT_JSON3_PARAM_VARIANTS: Record<string, string>[] = [
  { lang: "en" },
  {},
  { lang: "en", kind: "asr" },
  { kind: "asr" },
  { lang: "zh-Hans" },
  { lang: "zh" },
  { lang: "ja" }
];

const TIMEDTEXT_XML_PARAM_VARIANTS: Record<string, string>[] = [
  { lang: "en" },
  {},
  { lang: "en", kind: "asr" },
  { kind: "asr" }
];

function buildTimedtextUrl(
  videoId: string,
  fmt: "json3" | null,
  extra: Record<string, string>
): string {
  const u = new URL("https://www.youtube.com/api/timedtext");
  u.searchParams.set("v", videoId);
  if (fmt) u.searchParams.set("fmt", fmt);
  for (const [k, v] of Object.entries(extra)) {
    if (v) u.searchParams.set(k, v);
  }
  return u.toString();
}

function decodeXmlText(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function parseTimedtextXml(xml: string): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  const textRe =
    /<text[^>]*start="([^"]*)"[^>]*dur="([^"]*)"[^>]*>([\s\S]*?)<\/text>/gi;
  let m: RegExpExecArray | null;
  while ((m = textRe.exec(xml)) !== null) {
    const start = parseFloat(m[1]);
    const dur = parseFloat(m[2]);
    const text = decodeXmlText(m[3].replace(/<[^>]+>/g, "")).trim();
    if (!text || !Number.isFinite(start) || !Number.isFinite(dur)) continue;
    cues.push({ text, start, duration: dur });
  }
  if (cues.length > 0) return cues;

  const srv3 = /<p[^>]*t="(\d+)"[^>]*d="(\d+)"[^>]*>([\s\S]*?)<\/p>/gi;
  while ((m = srv3.exec(xml)) !== null) {
    const start = parseInt(m[1], 10) / 1000;
    const dur = parseInt(m[2], 10) / 1000;
    const text = decodeXmlText(m[3].replace(/<[^>]+>/g, "")).trim();
    if (!text) continue;
    cues.push({ text, start, duration: dur > 0 ? dur : 0 });
  }
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].duration <= 0 && i < cues.length - 1) {
      cues[i].duration = Math.max(0.1, cues[i + 1].start - cues[i].start);
    }
  }
  return cues;
}

async function tryTimedtextJson3(videoId: string): Promise<TranscriptFetchResult | null> {
  transcriptConsole("trying timedtext json3...", { videoId });
  for (let i = 0; i < TIMEDTEXT_JSON3_PARAM_VARIANTS.length; i++) {
    const params = TIMEDTEXT_JSON3_PARAM_VARIANTS[i];
    const url = buildTimedtextUrl(videoId, "json3", params);
    try {
      const res = await fetchWithYoutubeHeaders(url, undefined, { videoId });
      const snippet = (await res.clone().text()).slice(0, 400);
      transcriptConsole("timedtext json3 request", {
        videoId,
        variantIndex: i,
        params,
        status: res.status,
        ...(res.status === 403 || res.status === 429
          ? { hint: "possible YouTube IP block / rate limit on www.youtube.com" }
          : {})
      });
      if (!res.ok) {
        tlog(videoId, "timedtext-json3", {
          ok: false,
          status: res.status,
          variantIndex: i,
          params,
          bodySnippet: snippet
        });
        continue;
      }
      const text = await res.text();
      if (!text.trim()) {
        transcriptConsole("timedtext json3 empty body", { videoId, variantIndex: i, params });
        tlog(videoId, "timedtext-json3", { ok: false, reason: "empty body", variantIndex: i, params });
        continue;
      }
      let data: Json3Root;
      try {
        data = JSON.parse(text) as Json3Root;
      } catch (e) {
        transcriptConsole("timedtext json3 JSON parse failed:", errorMessage(e));
        tlog(videoId, "timedtext-json3", {
          ok: false,
          reason: "json parse",
          variantIndex: i,
          params,
          bodySnippet: snippet,
          error: e
        });
        continue;
      }
      const cues = parseJson3ToCues(data);
      if (cuesUsable(cues)) {
        transcriptConsole("timedtext json3 ok", { videoId, variantIndex: i, cueCount: cues.length });
        tlog(videoId, "timedtext-json3", { ok: true, cueCount: cues.length, variantIndex: i, params });
        return { cues, source: "timedtext-json3" };
      }
      transcriptConsole("timedtext json3 no usable cues", { videoId, variantIndex: i, params });
      tlog(videoId, "timedtext-json3", { ok: false, reason: "no cues", variantIndex: i, params });
    } catch (error: unknown) {
      transcriptConsole("timedtext json3 failed:", errorMessage(error));
      tlog(videoId, "timedtext-json3", { ok: false, variantIndex: i, params, error });
    }
  }
  transcriptConsole("timedtext json3 failed: all variants exhausted", { videoId });
  return null;
}

async function tryTimedtextXml(videoId: string): Promise<TranscriptFetchResult | null> {
  transcriptConsole("trying timedtext xml...", { videoId });
  for (let i = 0; i < TIMEDTEXT_XML_PARAM_VARIANTS.length; i++) {
    const params = TIMEDTEXT_XML_PARAM_VARIANTS[i];
    const url = buildTimedtextUrl(videoId, null, params);
    try {
      const res = await fetchWithYoutubeHeaders(url, undefined, { videoId });
      const snippet = (await res.clone().text()).slice(0, 400);
      transcriptConsole("timedtext xml request", {
        videoId,
        variantIndex: i,
        params,
        status: res.status,
        ...(res.status === 403 || res.status === 429
          ? { hint: "possible YouTube IP block / rate limit on www.youtube.com" }
          : {})
      });
      if (!res.ok) {
        tlog(videoId, "timedtext-xml", {
          ok: false,
          status: res.status,
          variantIndex: i,
          params,
          bodySnippet: snippet
        });
        continue;
      }
      const xml = await res.text();
      if (!xml.includes("<text") && !xml.includes("<p ")) {
        transcriptConsole("timedtext xml not cue markup", { videoId, variantIndex: i });
        tlog(videoId, "timedtext-xml", {
          ok: false,
          reason: "not xml cues",
          variantIndex: i,
          params,
          bodySnippet: snippet
        });
        continue;
      }
      const cues = parseTimedtextXml(xml);
      if (cuesUsable(cues)) {
        transcriptConsole("timedtext xml ok", { videoId, variantIndex: i, cueCount: cues.length });
        tlog(videoId, "timedtext-xml", { ok: true, cueCount: cues.length, variantIndex: i, params });
        return { cues, source: "timedtext-xml" };
      }
      transcriptConsole("timedtext xml no usable cues", { videoId, variantIndex: i });
    } catch (error: unknown) {
      transcriptConsole("timedtext xml failed:", errorMessage(error));
      tlog(videoId, "timedtext-xml", { ok: false, variantIndex: i, params, error });
    }
  }
  transcriptConsole("timedtext xml failed: all variants exhausted", { videoId });
  return null;
}

/**
 * Uses YouTube Data API `captions.list` (googleapis.com — stable on serverless) to discover
 * language/kind, then fetches `www.youtube.com/api/timedtext` with those exact params.
 * Note: `captions.download` requires OAuth; we only use list + public timedtext here.
 */
async function tryYoutubeDataApiGuidedTimedtext(
  videoId: string
): Promise<TranscriptFetchResult | null> {
  const key = env.youtubeDataApiKey();
  if (!key) {
    transcriptConsole("skipping youtube data api — YOUTUBE_API_KEY not set", { videoId });
    return null;
  }

  transcriptConsole("trying youtube data api captions.list + guided timedtext...", { videoId });
  const listUrl = new URL("https://www.googleapis.com/youtube/v3/captions");
  listUrl.searchParams.set("part", "snippet");
  listUrl.searchParams.set("videoId", videoId);
  listUrl.searchParams.set("key", key);

  let res: Response;
  try {
    res = await fetch(listUrl.toString());
  } catch (e: unknown) {
    transcriptConsole("youtube data api captions.list failed:", errorMessage(e));
    tlog(videoId, "youtube-data-api-guided-timedtext", { ok: false, step: "list_fetch", error: e });
    return null;
  }

  transcriptConsole("captions.list response.status", { videoId, status: res.status });
  if (res.status === 403 || res.status === 429) {
    transcriptConsole(
      "captions.list forbidden/rate-limited — enable YouTube Data API v3 for this key and check quota",
      { status: res.status }
    );
  }

  if (!res.ok) {
    const body = await res.text();
    transcriptConsole("captions.list failed body:", body.slice(0, 500));
    tlog(videoId, "youtube-data-api-guided-timedtext", {
      ok: false,
      step: "list",
      status: res.status,
      bodySnippet: body.slice(0, 400)
    });
    return null;
  }

  const data = (await res.json()) as {
    items?: Array<{ snippet: { language: string; trackKind?: string } }>;
  };
  const items = data.items ?? [];
  if (!items.length) {
    transcriptConsole(
      "captions.list returned no tracks (no captions or API cannot list this video)",
      { videoId }
    );
    return null;
  }

  transcriptConsole("captions.list tracks", {
    videoId,
    count: items.length,
    languages: items.map((x) => ({ lang: x.snippet.language, kind: x.snippet.trackKind }))
  });

  const seen = new Set<string>();
  const attempts: Array<Record<string, string>> = [];
  const sorted = [...items].sort((a, b) => {
    const aEn = a.snippet.language.toLowerCase().startsWith("en") ? 0 : 1;
    const bEn = b.snippet.language.toLowerCase().startsWith("en") ? 0 : 1;
    return aEn - bEn;
  });

  for (const it of sorted) {
    const lang = it.snippet.language;
    const kind = (it.snippet.trackKind ?? "").toUpperCase();
    const isAsr = kind === "ASR";
    const dedupeKey = `${lang}|${isAsr ? "asr" : "std"}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const params: Record<string, string> = { lang };
    if (isAsr) params.kind = "asr";
    attempts.push(params);
  }

  const maxAttempts = Math.min(attempts.length, 12);
  for (let i = 0; i < maxAttempts; i++) {
    const params = attempts[i];
    const url = buildTimedtextUrl(videoId, "json3", params);
    try {
      const tres = await fetchWithYoutubeHeaders(url, undefined, { videoId });
      transcriptConsole("data-api-guided timedtext json3 request", {
        videoId,
        attempt: i,
        params,
        status: tres.status,
        ...(tres.status === 403 || tres.status === 429
          ? { hint: "timedtext is still on youtube.com — possible IP block" }
          : {})
      });
      if (!tres.ok) continue;
      const text = await tres.text();
      if (!text.trim()) continue;
      let parsed: Json3Root;
      try {
        parsed = JSON.parse(text) as Json3Root;
      } catch (e: unknown) {
        transcriptConsole("data-api-guided timedtext JSON parse failed:", errorMessage(e));
        continue;
      }
      const cues = parseJson3ToCues(parsed);
      if (cuesUsable(cues)) {
        transcriptConsole("youtube data api guided timedtext ok", {
          videoId,
          params,
          cueCount: cues.length
        });
        tlog(videoId, "youtube-data-api-guided-timedtext", {
          ok: true,
          cueCount: cues.length,
          params
        });
        return { cues, source: "youtube-data-api-guided-timedtext" };
      }
    } catch (e: unknown) {
      transcriptConsole("data-api-guided timedtext failed:", errorMessage(e));
    }
  }

  transcriptConsole("youtube data api guided timedtext failed: all listed languages exhausted", {
    videoId
  });
  return null;
}

type CaptionTrackLike = {
  base_url: string;
  language_code?: string;
  kind?: string;
};

function pickCaptionTrack(tracks: CaptionTrackLike[]): CaptionTrackLike | null {
  if (!tracks.length) return null;
  const en = tracks.find((t) => t.language_code === "en");
  if (en) return en;
  const asr = tracks.find((t) => t.kind === "asr");
  if (asr) return asr;
  return tracks[0];
}

function transcriptPanelToCues(transcriptInfo: {
  transcript?: {
    content?: {
      body?: {
        initial_segments?: Array<{
          type?: string;
          start_ms?: string;
          end_ms?: string;
          snippet?: { text?: string };
        }>;
      } | null;
    } | null;
  };
}): TranscriptCue[] {
  const segs = transcriptInfo.transcript?.content?.body?.initial_segments;
  if (!segs?.length) return [];
  const cues: TranscriptCue[] = [];
  for (const seg of segs) {
    if (seg.type !== "TranscriptSegment") continue;
    const text = String(seg.snippet?.text ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const startMs = Number(seg.start_ms);
    const endMs = Number(seg.end_ms);
    const start = startMs / 1000;
    const end = endMs / 1000;
    const duration = Math.max(0.1, end - start);
    cues.push({ text, start, duration });
  }
  return cues;
}

/**
 * youtubei.js (InnerTube): player caption `base_url` is a timedtext URL with token params;
 * `getTranscript()` uses the searchable transcript engagement panel when present.
 */
async function tryYoutubeiJs(videoId: string): Promise<TranscriptFetchResult | null> {
  transcriptConsole("trying youtubei.js (innertube)...", { videoId });
  try {
    const { Innertube } = await import("youtubei.js");
    const yt = await Innertube.create();
    const info = await yt.getInfo(videoId);

    const tracks = info.captions?.caption_tracks as CaptionTrackLike[] | undefined;
    const track = tracks?.length ? pickCaptionTrack(tracks) : null;
    if (track?.base_url) {
      const capUrl = new URL(track.base_url);
      capUrl.searchParams.set("fmt", "json3");
      const res = await fetchWithYoutubeHeaders(capUrl.toString(), undefined, { videoId });
      transcriptConsole("youtubei.js caption track timedtext request", {
        videoId,
        status: res.status,
        language: track.language_code,
        kind: track.kind,
        ...(res.status === 403 || res.status === 429
          ? { hint: "possible YouTube IP block on caption URL" }
          : {})
      });
      const body = await res.text();
      if (res.ok && body.trim().startsWith("{")) {
        try {
          const data = JSON.parse(body) as Json3Root;
          const cues = parseJson3ToCues(data);
          if (cuesUsable(cues)) {
            transcriptConsole("youtubei.js caption track ok", { videoId, cueCount: cues.length });
            tlog(videoId, "youtubei-caption-track", {
              ok: true,
              cueCount: cues.length,
              language: track.language_code,
              kind: track.kind
            });
            return { cues, source: "youtubei-caption-track" };
          }
        } catch (e: unknown) {
          transcriptConsole("youtubei.js caption track JSON parse failed:", errorMessage(e));
          tlog(videoId, "youtubei-caption-track", { ok: false, reason: "json parse", error: e });
        }
      } else {
        transcriptConsole("youtubei.js caption track unusable response", {
          videoId,
          status: res.status
        });
        tlog(videoId, "youtubei-caption-track", {
          ok: false,
          status: res.status,
          bodySnippet: body.slice(0, 200)
        });
      }
    } else {
      transcriptConsole("youtubei.js: no caption_tracks on player response", { videoId });
    }

    try {
      transcriptConsole("youtubei.js trying getTranscript() panel...", { videoId });
      const transcriptInfo = await info.getTranscript();
      const cues = transcriptPanelToCues(transcriptInfo);
      if (cuesUsable(cues)) {
        transcriptConsole("youtubei.js transcript panel ok", { videoId, cueCount: cues.length });
        tlog(videoId, "youtubei-transcript-panel", { ok: true, cueCount: cues.length });
        return { cues, source: "youtubei-transcript-panel" };
      }
      transcriptConsole("youtubei.js transcript panel: no usable cues", { videoId });
    } catch (e: unknown) {
      transcriptConsole("youtubei.js getTranscript failed:", errorMessage(e));
      tlog(videoId, "youtubei-transcript-panel", {
        ok: false,
        reason: "no panel or failed",
        error: e
      });
    }
    transcriptConsole("youtubei.js failed: no transcript from innertube paths", { videoId });
    return null;
  } catch (error: unknown) {
    transcriptConsole("youtubei.js failed:", errorMessage(error));
    tlog(videoId, "youtubei.js", { ok: false, error });
    return null;
  }
}

/**
 * Parse watch page HTML for caption track baseUrl, then fetch json3 or XML.
 */
async function tryWatchPageCaptionTrack(videoId: string): Promise<TranscriptFetchResult | null> {
  transcriptConsole("trying watch page captionTracks + timedtext...", { videoId });
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  try {
    const res = await fetchWithYoutubeHeaders(watchUrl, undefined, { videoId });
    const htmlSnippet = (await res.clone().text()).slice(0, 500);
    transcriptConsole("watch page /watch fetch", {
      videoId,
      status: res.status,
      ...(res.status === 403 || res.status === 429
        ? { hint: "possible YouTube IP block on watch page" }
        : {})
    });
    if (!res.ok) {
      transcriptConsole("watch page failed:", { status: res.status, snippet: htmlSnippet.slice(0, 200) });
      tlog(videoId, "watch-page-caption-track", {
        ok: false,
        status: res.status,
        bodySnippet: htmlSnippet
      });
      return null;
    }
    const html = await res.text();
    const idx = html.indexOf('"captionTracks"');
    if (idx === -1) {
      transcriptConsole("watch page: no captionTracks in HTML", { videoId });
      tlog(videoId, "watch-page-caption-track", { ok: false, reason: "no captionTracks in HTML" });
      return null;
    }
    const sub = html.slice(idx, idx + 80000);
    const baseUrlMatch = sub.match(/"baseUrl":"([^"]+)"/);
    if (!baseUrlMatch) {
      transcriptConsole("watch page: no baseUrl in captionTracks", { videoId });
      tlog(videoId, "watch-page-caption-track", { ok: false, reason: "no baseUrl" });
      return null;
    }
    const baseUrl = baseUrlMatch[1].replace(/\\u0026/g, "&");
    const captionUrl = new URL(baseUrl);
    if (!captionUrl.searchParams.has("fmt")) {
      captionUrl.searchParams.set("fmt", "json3");
    }

    const cres = await fetchWithYoutubeHeaders(captionUrl.toString(), undefined, { videoId });
    transcriptConsole("watch page caption json3 fetch", { videoId, status: cres.status });
    const body = await cres.text();
    if (cres.ok && body.trim().startsWith("{")) {
      try {
        const data = JSON.parse(body) as Json3Root;
        const cues = parseJson3ToCues(data);
        if (cuesUsable(cues)) {
          transcriptConsole("watch page caption json3 ok", { videoId, cueCount: cues.length });
          tlog(videoId, "watch-page-caption-track", { ok: true, cueCount: cues.length, fmt: "json3" });
          return { cues, source: "watch-page-caption-track" };
        }
      } catch (e: unknown) {
        transcriptConsole("watch page caption json3 parse failed:", errorMessage(e));
        tlog(videoId, "watch-page-caption-track", { ok: false, reason: "json3 parse", error: e });
      }
    }
    const xmlUrl = new URL(baseUrl);
    xmlUrl.searchParams.delete("fmt");
    const xres = await fetchWithYoutubeHeaders(xmlUrl.toString(), undefined, { videoId });
    transcriptConsole("watch page caption xml fetch", { videoId, status: xres.status });
    const xml = await xres.text();
    if (xres.ok && (xml.includes("<text") || xml.includes("<p "))) {
      const cues = parseTimedtextXml(xml);
      if (cuesUsable(cues)) {
        transcriptConsole("watch page caption xml ok", { videoId, cueCount: cues.length });
        tlog(videoId, "watch-page-caption-track", { ok: true, cueCount: cues.length, fmt: "xml" });
        return { cues, source: "watch-page-caption-track" };
      }
    }
    transcriptConsole("watch page caption fetch unusable", { videoId });
    tlog(videoId, "watch-page-caption-track", { ok: false, reason: "caption fetch unusable" });
  } catch (error: unknown) {
    transcriptConsole("watch page caption track failed:", errorMessage(error));
    tlog(videoId, "watch-page-caption-track", { ok: false, error });
  }
  transcriptConsole("watch page caption track failed: exhausted", { videoId });
  return null;
}

/**
 * Try every transcript strategy in order. Returns null if all fail (caller may use Gemini/oEmbed fallback).
 */
export async function getTranscriptWithFallbacks(
  videoId: string
): Promise<TranscriptFetchResult | null> {
  const id = videoId.trim();
  if (!id) {
    tlog(id, "getTranscriptWithFallbacks", { ok: false, reason: "empty video id" });
    return null;
  }

  const chain: Array<() => Promise<TranscriptFetchResult | null>> = [
    () => tryTimedtextJson3(id),
    () => tryTimedtextXml(id),
    () => tryYoutubeDataApiGuidedTimedtext(id),
    () => tryWatchPageCaptionTrack(id),
    () => tryYoutubeiJs(id),
    () => tryYoutubeTranscriptPackage(id)
  ];

  for (let i = 0; i < chain.length; i++) {
    const result = await chain[i]();
    if (result && cuesUsable(result.cues)) {
      transcriptConsole("transcript success", { videoId: id, source: result.source });
      return result;
    }
  }

  transcriptConsole("all transcript fallbacks failed — see logs above for each status/error", {
    videoId: id
  });
  tlog(id, "getTranscriptWithFallbacks", { ok: false, reason: "all methods exhausted" });
  return null;
}

/**
 * Backwards-compatible: same as getTranscriptWithFallbacks but throws if nothing found.
 * Prefer getTranscriptWithFallbacks + Gemini fallback in API routes.
 */
export async function getTranscript(videoId: string): Promise<TranscriptCue[]> {
  const r = await getTranscriptWithFallbacks(videoId);
  if (r?.cues?.length && cuesUsable(r.cues)) return r.cues;
  throw new Error("No transcript available for this video after all fetch strategies.");
}

/** Public oEmbed API — works when timedtext is blocked; used for title-only Gemini fallback. */
export async function fetchYouTubeOEmbedTitle(videoPageUrl: string): Promise<string | null> {
  const u = new URL("https://www.youtube.com/oembed");
  u.searchParams.set("url", videoPageUrl.trim());
  u.searchParams.set("format", "json");
  try {
    const res = await fetchWithYoutubeHeaders(u.toString());
    if (!res.ok) {
      console.log(
        "[transcript] oembed",
        JSON.stringify({ ok: false, status: res.status, url: u.toString() })
      );
      return null;
    }
    const j = (await res.json()) as { title?: string };
    const title = j.title?.trim() ?? null;
    console.log("[transcript] oembed", JSON.stringify({ ok: true, titleLen: title?.length ?? 0 }));
    return title;
  } catch (error: unknown) {
    console.log("[transcript] oembed", JSON.stringify({ ok: false, error: String(error) }));
    return null;
  }
}
