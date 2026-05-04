import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import {
  extractMaterialsAndToolsFromPublicVideoUrl,
  extractMaterialsAndToolsFromYouTube,
} from "@/lib/gemini";
import { buildCloudflareDownloadUrl } from "@/lib/cloudflareStream";
import { extractYouTubeVideoId } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  youtubeUrl?: string;
  streamVideoId?: string;
};

export async function POST(req: Request) {
  if (!env.geminiApiKey()) {
    return NextResponse.json(
      { error: "AI is not configured (missing GEMINI_API_KEY)." },
      { status: 503 }
    );
  }

  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const youtubeUrl = String(body.youtubeUrl ?? "").trim();
  const streamVideoId = String(body.streamVideoId ?? "").trim();

  if (streamVideoId) {
    try {
      const customerSubdomain = env.cloudflareStream.customerSubdomain()?.trim();
      if (!customerSubdomain) {
        return NextResponse.json(
          { error: "Cloudflare Stream is not configured." },
          { status: 500 }
        );
      }
      const publicVideoUrl = buildCloudflareDownloadUrl(customerSubdomain, streamVideoId);
      const { materials, tools } = await extractMaterialsAndToolsFromPublicVideoUrl(
        publicVideoUrl,
        "video/mp4"
      );
      return NextResponse.json({ materials, tools });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Extraction failed";
      console.error("[extract-materials] stream", e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (!youtubeUrl) {
    return NextResponse.json(
      { error: "Provide a YouTube URL or Cloudflare Stream video id first." },
      { status: 400 }
    );
  }

  if (!extractYouTubeVideoId(youtubeUrl)) {
    return NextResponse.json({ error: "Invalid YouTube URL." }, { status: 400 });
  }

  try {
    const { materials, tools } = await extractMaterialsAndToolsFromYouTube(youtubeUrl);
    return NextResponse.json({ materials, tools });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Extraction failed";
    console.error("[extract-materials]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
