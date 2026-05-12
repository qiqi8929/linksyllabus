import { NextResponse } from "next/server";
import { publicSiteOriginFromRequest } from "@/lib/publicOrigin";
import { qrPngBuffer } from "@/lib/qrPng";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasStepTimestamp } from "@/lib/stepTimestamp";
import { extractVimeoVideoId, extractYouTubeVideoId } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StepRow = {
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

/** Final guard: any non-empty http(s) URL is scannable; everything else falls back. */
function safeQrTarget(url: string, fallback: string): string {
  const t = (url ?? "").trim();
  if (!/^https?:\/\//i.test(t)) return fallback;
  return t;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const base = publicSiteOriginFromRequest(req);
  const playUrl = `${base}/play/${params.id}`;

  let target = playUrl;
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("steps")
      .select("id,youtube_url,start_time,end_time")
      .eq("id", params.id)
      .maybeSingle();

    const step = data as StepRow | null;
    if (step) {
      if (hasStepTimestamp(step)) {
        target = playUrl;
      } else {
        const sourceUrl = publicFullVideoUrl(step.youtube_url);
        target = sourceUrl ?? playUrl;
      }
    }
  } catch {
    /* fall through to playUrl */
  }

  const finalTarget = safeQrTarget(target, playUrl);
  const png = await qrPngBuffer(finalTarget);

  const download = new URL(req.url).searchParams.get("download") === "1";
  const body = new Uint8Array(png);

  return new NextResponse(body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store",
      ...(download
        ? {
            "content-disposition": `attachment; filename="linksylabus-step-${params.id}.png"`
          }
        : {})
    }
  });
}
