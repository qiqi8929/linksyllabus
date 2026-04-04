import { fetchTranscript, type TranscriptResponse } from "youtube-transcript";

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
  | "watch-page-caption-track";

export type TranscriptFetchResult = {
  cues: TranscriptCue[];
  source: TranscriptFetchSource;
};

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

/** Browser-like fetch for YouTube (datacenter IPs often need this). */
export function fetchWithYoutubeHeaders(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const h = new Headers(init?.headers);
  if (!h.has("User-Agent")) h.set("User-Agent", BROWSER_USER_AGENT);
  if (!h.has("Accept-Language")) h.set("Accept-Language", "en-US,en;q=0.9");
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
  try {
    const raw = await fetchTranscript(videoId, {
      fetch: (url, init) => fetchWithYoutubeHeaders(url, init)
    });
    if (!raw?.length) {
      tlog(videoId, "youtube-transcript-package", { ok: false, reason: "empty" });
      return null;
    }
    const cues = packageRowsToCues(raw);
    if (!cuesUsable(cues)) {
      tlog(videoId, "youtube-transcript-package", { ok: false, reason: "no text" });
      return null;
    }
    tlog(videoId, "youtube-transcript-package", { ok: true, cueCount: cues.length });
    return { cues, source: "youtube-transcript-package" };
  } catch (error: unknown) {
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

function timedtextJson3Url(videoId: string, withLangEn: boolean): string {
  const u = new URL("https://www.youtube.com/api/timedtext");
  u.searchParams.set("v", videoId);
  u.searchParams.set("fmt", "json3");
  if (withLangEn) u.searchParams.set("lang", "en");
  return u.toString();
}

/** https://www.youtube.com/api/timedtext?v={id}&lang=en (XML) */
function timedtextXmlUrl(videoId: string, withLangEn: boolean): string {
  const u = new URL("https://www.youtube.com/api/timedtext");
  u.searchParams.set("v", videoId);
  if (withLangEn) u.searchParams.set("lang", "en");
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
  for (const withLang of [true, false]) {
    const url = timedtextJson3Url(videoId, withLang);
    try {
      const res = await fetchWithYoutubeHeaders(url);
      const snippet = (await res.clone().text()).slice(0, 400);
      if (!res.ok) {
        tlog(videoId, "timedtext-json3", {
          ok: false,
          status: res.status,
          withLangEn: withLang,
          bodySnippet: snippet
        });
        continue;
      }
      const text = await res.text();
      if (!text.trim()) {
        tlog(videoId, "timedtext-json3", { ok: false, reason: "empty body", withLangEn: withLang });
        continue;
      }
      let data: Json3Root;
      try {
        data = JSON.parse(text) as Json3Root;
      } catch (e) {
        tlog(videoId, "timedtext-json3", {
          ok: false,
          reason: "json parse",
          withLangEn: withLang,
          bodySnippet: snippet,
          error: e
        });
        continue;
      }
      const cues = parseJson3ToCues(data);
      if (cuesUsable(cues)) {
        tlog(videoId, "timedtext-json3", { ok: true, cueCount: cues.length, withLangEn: withLang });
        return { cues, source: "timedtext-json3" };
      }
      tlog(videoId, "timedtext-json3", { ok: false, reason: "no cues", withLangEn: withLang });
    } catch (error: unknown) {
      tlog(videoId, "timedtext-json3", { ok: false, withLangEn: withLang, error });
    }
  }
  return null;
}

async function tryTimedtextXml(videoId: string): Promise<TranscriptFetchResult | null> {
  for (const withLang of [true, false]) {
    const url = timedtextXmlUrl(videoId, withLang);
    try {
      const res = await fetchWithYoutubeHeaders(url);
      const snippet = (await res.clone().text()).slice(0, 400);
      if (!res.ok) {
        tlog(videoId, "timedtext-xml", {
          ok: false,
          status: res.status,
          withLangEn: withLang,
          bodySnippet: snippet
        });
        continue;
      }
      const xml = await res.text();
      if (!xml.includes("<text") && !xml.includes("<p ")) {
        tlog(videoId, "timedtext-xml", {
          ok: false,
          reason: "not xml cues",
          withLangEn: withLang,
          bodySnippet: snippet
        });
        continue;
      }
      const cues = parseTimedtextXml(xml);
      if (cuesUsable(cues)) {
        tlog(videoId, "timedtext-xml", { ok: true, cueCount: cues.length, withLangEn: withLang });
        return { cues, source: "timedtext-xml" };
      }
    } catch (error: unknown) {
      tlog(videoId, "timedtext-xml", { ok: false, withLangEn: withLang, error });
    }
  }
  return null;
}

/**
 * Parse watch page HTML for caption track baseUrl, then fetch json3 or XML.
 */
async function tryWatchPageCaptionTrack(videoId: string): Promise<TranscriptFetchResult | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  try {
    const res = await fetchWithYoutubeHeaders(watchUrl);
    const htmlSnippet = (await res.clone().text()).slice(0, 500);
    if (!res.ok) {
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
      tlog(videoId, "watch-page-caption-track", { ok: false, reason: "no captionTracks in HTML" });
      return null;
    }
    const sub = html.slice(idx, idx + 80000);
    const baseUrlMatch = sub.match(/"baseUrl":"([^"]+)"/);
    if (!baseUrlMatch) {
      tlog(videoId, "watch-page-caption-track", { ok: false, reason: "no baseUrl" });
      return null;
    }
    const baseUrl = baseUrlMatch[1].replace(/\\u0026/g, "&");
    const captionUrl = new URL(baseUrl);
    if (!captionUrl.searchParams.has("fmt")) {
      captionUrl.searchParams.set("fmt", "json3");
    }

    const cres = await fetchWithYoutubeHeaders(captionUrl.toString());
    const body = await cres.text();
    if (cres.ok && body.trim().startsWith("{")) {
      try {
        const data = JSON.parse(body) as Json3Root;
        const cues = parseJson3ToCues(data);
        if (cuesUsable(cues)) {
          tlog(videoId, "watch-page-caption-track", { ok: true, cueCount: cues.length, fmt: "json3" });
          return { cues, source: "watch-page-caption-track" };
        }
      } catch (e) {
        tlog(videoId, "watch-page-caption-track", { ok: false, reason: "json3 parse", error: e });
      }
    }
    const xmlUrl = new URL(baseUrl);
    xmlUrl.searchParams.delete("fmt");
    const xres = await fetchWithYoutubeHeaders(xmlUrl.toString());
    const xml = await xres.text();
    if (xres.ok && (xml.includes("<text") || xml.includes("<p "))) {
      const cues = parseTimedtextXml(xml);
      if (cuesUsable(cues)) {
        tlog(videoId, "watch-page-caption-track", { ok: true, cueCount: cues.length, fmt: "xml" });
        return { cues, source: "watch-page-caption-track" };
      }
    }
    tlog(videoId, "watch-page-caption-track", { ok: false, reason: "caption fetch unusable" });
  } catch (error: unknown) {
    tlog(videoId, "watch-page-caption-track", { ok: false, error });
  }
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
    () => tryYoutubeTranscriptPackage(id),
    () => tryTimedtextJson3(id),
    () => tryTimedtextXml(id),
    () => tryWatchPageCaptionTrack(id)
  ];

  for (let i = 0; i < chain.length; i++) {
    const result = await chain[i]();
    if (result && cuesUsable(result.cues)) {
      return result;
    }
  }

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
