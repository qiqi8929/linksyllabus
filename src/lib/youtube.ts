/**
 * YouTube Data API v3 — server-side only (requires YOUTUBE_API_KEY).
 * @see https://developers.google.com/youtube/v3/docs/videos/list
 */

export type YouTubeVideoSnippet = {
  title: string;
  description: string;
};

export async function fetchYouTubeVideoSnippet(
  videoId: string,
  apiKey: string
): Promise<YouTubeVideoSnippet> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`YouTube Data API failed: ${res.status} ${text}`);
  }

  let data: { items?: Array<{ snippet?: { title?: string; description?: string } }> };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new Error("YouTube Data API returned invalid JSON.");
  }

  const snippet = data.items?.[0]?.snippet;
  if (!snippet) {
    throw new Error("Video not found or unavailable.");
  }

  return {
    title: String(snippet.title ?? ""),
    description: String(snippet.description ?? "")
  };
}
