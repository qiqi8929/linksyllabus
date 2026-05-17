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
 * QR API route — work orders use {@link resolveWorkOrderQrTarget}; legacy
 * surfaces use this helper. Pure / no I/O so callers can use it client-side.
 *
 * Behavior:
 *   - timestamped step → `${origin}/play/${stepId}` (LinkSyllabus play page)
 *   - no timestamp, YouTube → `https://www.youtube.com/watch?v=…`
 *   - no timestamp, Vimeo → `https://vimeo.com/…`
 *   - anything else / unknown → `${origin}/play/${stepId}` (guaranteed valid)
 */
/** YouTube watch URL at `start_time` (seconds) for work-order QR codes. */
export function resolveWorkOrderQrTarget(
  step: StepLikeForQr | null,
  origin: string
): string {
  const playUrl = `${origin}/play/${step?.id ?? ""}`;
  if (!step) return safeQrTarget(playUrl, playUrl);

  const ytId = extractYouTubeVideoId(step.youtube_url ?? "");
  if (ytId) {
    const startSec = Math.max(0, Math.floor(Number(step.start_time) || 0));
    const base = `https://www.youtube.com/watch?v=${encodeURIComponent(ytId)}`;
    if (hasStepTimestamp(step) && startSec > 0) {
      return `${base}&t=${startSec}`;
    }
    return base;
  }

  const vimeoId = extractVimeoVideoId(step.youtube_url ?? "");
  if (vimeoId) {
    const startSec = Math.max(0, Math.floor(Number(step.start_time) || 0));
    const base = `https://vimeo.com/${encodeURIComponent(vimeoId)}`;
    if (hasStepTimestamp(step) && startSec > 0) {
      return `${base}#t=${startSec}s`;
    }
    return base;
  }

  return resolveStepQrTarget(step, origin);
}

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
