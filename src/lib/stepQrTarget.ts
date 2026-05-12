import { hasStepTimestamp } from "@/lib/stepTimestamp";
import { extractVimeoVideoId, extractYouTubeVideoId } from "@/lib/video";

export type StepLikeForQr = {
  id: string;
  youtube_url: string | null;
  start_time: number | null;
  end_time: number | null;
};

/**
 * Public "play from beginning" URL for a step's source video, when its
 * `start_time` / `end_time` are missing. Returns `null` for sources that have
 * no scannable public URL (uploaded files / Cloudflare Stream ids), so the
 * caller can fall back to the play page.
 */
function publicFullVideoUrl(rawUrl: string | null | undefined): string | null {
  const raw = (rawUrl ?? "").trim();
  if (!raw) return null;

  const ytId = extractYouTubeVideoId(raw);
  if (ytId) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(ytId)}`;
  }

  const vimeoId = extractVimeoVideoId(raw);
  if (vimeoId) {
    return `https://vimeo.com/${encodeURIComponent(vimeoId)}`;
  }

  return null;
}

/** Any non-empty http(s) URL is scannable; everything else falls back. */
function safeQrTarget(url: string, fallback: string): string {
  const t = (url ?? "").trim();
  if (!/^https?:\/\//i.test(t)) return fallback;
  return t;
}

/**
 * One source of truth for "what URL does a step's QR encode?". Used by the
 * QR API route — both the PDF and the long image hit the same route, so this
 * helper is the single place where the target is decided. Pure / no I/O so
 * callers can also use it client-side for diagnostics.
 *
 * Behavior:
 *   - timestamped step → `${origin}/play/${stepId}` (LinkSyllabus play page)
 *   - no timestamp, YouTube → `https://www.youtube.com/watch?v=…`
 *   - no timestamp, Vimeo → `https://vimeo.com/…`
 *   - anything else / unknown → `${origin}/play/${stepId}` (guaranteed valid)
 */
export function resolveStepQrTarget(
  step: StepLikeForQr | null,
  origin: string
): string {
  const playUrl = `${origin}/play/${step?.id ?? ""}`;
  if (!step) return safeQrTarget(playUrl, playUrl);

  if (hasStepTimestamp(step)) {
    return safeQrTarget(playUrl, playUrl);
  }

  const sourceUrl = publicFullVideoUrl(step.youtube_url);
  return safeQrTarget(sourceUrl ?? playUrl, playUrl);
}
