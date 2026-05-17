import { env } from "@/lib/env";
import { BROWSER_USER_AGENT } from "@/lib/transcript";

/** Parse YouTube Data API `PT#H#M#S` duration. */
export function parseIso8601Duration(iso: string): number | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(iso.trim());
  if (!m) return null;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  const total = h * 3600 + min * 60 + s;
  return total > 0 ? total : null;
}

/**
 * Real YouTube video length in seconds (Data API if configured, else watch-page scrape).
 */
export async function fetchYouTubeVideoDurationSec(videoId: string): Promise<number | null> {
  const id = videoId.trim();
  if (!id) return null;

  const key = env.youtubeDataApiKey();
  if (key) {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "contentDetails");
      url.searchParams.set("id", id);
      url.searchParams.set("key", key);
      const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
      if (res.ok) {
        const data = (await res.json()) as {
          items?: Array<{ contentDetails?: { duration?: string } }>;
        };
        const iso = data.items?.[0]?.contentDetails?.duration;
        if (iso) {
          const sec = parseIso8601Duration(iso);
          if (sec != null) return sec;
        }
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, {
      headers: { "User-Agent": BROWSER_USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
      next: { revalidate: 3600 }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const secMatch =
      html.match(/"lengthSeconds"\s*:\s*"(\d+)"/) ??
      html.match(/"length_seconds"\s*:\s*(\d+)/);
    if (secMatch) {
      const sec = parseInt(secMatch[1], 10);
      if (Number.isFinite(sec) && sec > 0) return sec;
    }
    const msMatch = html.match(/"approxDurationMs"\s*:\s*"(\d+)"/);
    if (msMatch) {
      const sec = Math.floor(parseInt(msMatch[1], 10) / 1000);
      if (sec > 0) return sec;
    }
  } catch {
    return null;
  }

  return null;
}

export function formatVideoDurationClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}
