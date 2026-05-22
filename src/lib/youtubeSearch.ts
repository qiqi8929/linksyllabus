import { env } from "@/lib/env";
import { parseIso8601Duration } from "@/lib/youtubeDuration";

export type YouTubeSearchResult = {
  videoId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  durationSec: number | null;
  url: string;
};

/**
 * Magic Log / trade-aware YouTube search query.
 * Example: "install branch circuits" + Electrician → "install branch circuits electrician how to"
 */
export function buildTradeAwareYouTubeSearchQuery(
  taskName: string,
  trade?: string | null
): string {
  const task = taskName.trim();
  const tradeLabel = trade?.trim();
  if (!task) return "how to";
  if (!tradeLabel) return `${task} how to`;
  return `${task} ${tradeLabel} how to`;
}

export async function searchYouTubeVideos(
  query: string,
  maxResults = 5
): Promise<YouTubeSearchResult[]> {
  const key = env.youtubeDataApiKey();
  if (!key) {
    throw new Error("YouTube search is not configured (missing YOUTUBE_API_KEY).");
  }

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("maxResults", String(Math.min(maxResults, 10)));
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("key", key);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    const body = await searchRes.text();
    throw new Error(`YouTube search failed: ${body.slice(0, 200)}`);
  }

  const searchData = (await searchRes.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
      };
    }>;
  };

  const items = searchData.items ?? [];
  const videoIds = items
    .map((i) => i.id?.videoId)
    .filter((id): id is string => Boolean(id));

  if (videoIds.length === 0) return [];

  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.searchParams.set("part", "contentDetails,snippet");
  videosUrl.searchParams.set("id", videoIds.join(","));
  videosUrl.searchParams.set("key", key);

  const videosRes = await fetch(videosUrl.toString());
  const videosData = videosRes.ok
    ? ((await videosRes.json()) as {
        items?: Array<{
          id?: string;
          contentDetails?: { duration?: string };
          snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string } } };
        }>;
      })
    : { items: [] };

  const byId = new Map(
    (videosData.items ?? []).map((v) => [v.id, v] as const)
  );

  const out: YouTubeSearchResult[] = [];
  for (const id of videoIds) {
    const searchItem = items.find((i) => i.id?.videoId === id);
    const detail = byId.get(id);
    const durationIso = detail?.contentDetails?.duration;
    const durationSec = durationIso ? parseIso8601Duration(durationIso) : null;
    const thumb =
      detail?.snippet?.thumbnails?.medium?.url ??
      searchItem?.snippet?.thumbnails?.medium?.url ??
      searchItem?.snippet?.thumbnails?.default?.url ??
      "";

    out.push({
      videoId: id,
      title: detail?.snippet?.title ?? searchItem?.snippet?.title ?? "Video",
      channel: detail?.snippet?.channelTitle ?? searchItem?.snippet?.channelTitle ?? "",
      thumbnailUrl: thumb,
      durationSec,
      url: `https://www.youtube.com/watch?v=${id}`
    });
  }

  return out;
}

export function formatDurationClock(totalSec: number | null): string {
  if (totalSec == null || !Number.isFinite(totalSec)) return "—";
  const s = Math.floor(totalSec);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${min}:${String(sec).padStart(2, "0")}`;
}
