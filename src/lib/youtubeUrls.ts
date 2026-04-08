/**
 * Canonical YouTube URLs for embed / watch (tutorial & fallbacks).
 * Embed: https://www.youtube.com/embed/VIDEO_ID?start=seconds
 */

export function getYouTubeThumbnailUrl(
  videoId: string,
  quality: "hq" | "maxres" = "hq"
): string {
  const id = encodeURIComponent(videoId);
  return quality === "maxres"
    ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg`
    : `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

/** Origins that may postMessage from YouTube embed iframes (enablejsapi=1). */
export const YOUTUBE_EMBED_MESSAGE_ORIGINS = [
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com"
] as const;

export function buildYouTubeEmbedUrl(
  videoId: string,
  startSec: number,
  opts?: {
    /** Show YouTube chrome (recommended for iframe-only playback). */
    controls?: boolean;
    /** Absolute end time in seconds from the start of the video (YouTube `end` param). */
    endSec?: number;
    autoplay?: boolean;
    /**
     * Use youtube-nocookie.com — often fixes blank embeds in Safari / Edge / strict privacy
     * where youtube.com cookies are blocked.
     */
    privacyEnhanced?: boolean;
  }
): string {
  const start = Math.max(0, Math.floor(startSec));
  const base = opts?.privacyEnhanced
    ? "https://www.youtube-nocookie.com/embed/"
    : "https://www.youtube.com/embed/";
  const u = new URL(`${base}${encodeURIComponent(videoId)}`);
  u.searchParams.set("start", String(start));
  u.searchParams.set("rel", "0");
  u.searchParams.set("modestbranding", "1");
  u.searchParams.set("playsinline", "1");
  u.searchParams.set("enablejsapi", "1");
  if (opts?.controls === false) {
    u.searchParams.set("controls", "0");
  } else {
    u.searchParams.set("controls", "1");
  }
  const endAbs = opts?.endSec;
  if (
    endAbs != null &&
    Number.isFinite(endAbs) &&
    Math.floor(endAbs) > start
  ) {
    u.searchParams.set("end", String(Math.floor(endAbs)));
  }
  if (opts?.autoplay) {
    u.searchParams.set("autoplay", "1");
  }
  return u.toString();
}

/** Privacy-enhanced host; sometimes works when standard embed is cookie-blocked. */
export function buildYouTubeNoCookieEmbedUrl(
  videoId: string,
  startSec: number
): string {
  const start = Math.max(0, Math.floor(startSec));
  const u = new URL(
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`
  );
  u.searchParams.set("start", String(start));
  u.searchParams.set("rel", "0");
  u.searchParams.set("modestbranding", "1");
  u.searchParams.set("playsinline", "1");
  return u.toString();
}

export function buildYouTubeWatchUrl(videoId: string, startSec: number): string {
  const u = new URL("https://www.youtube.com/watch");
  u.searchParams.set("v", videoId);
  if (startSec > 0) {
    u.searchParams.set("t", `${Math.floor(startSec)}s`);
  }
  return u.toString();
}
