import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import {
  extractTutorialStructureFromPublicVideoUrl,
  extractTutorialStructureFromYouTubeVideo
} from "@/lib/gemini";
import {
  buildCloudflareDownloadUrl,
  setCloudflareStreamVideoDownloadable
} from "@/lib/cloudflareStream";
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

  const rawBody = await req.text();
  const bodyBytes = Buffer.byteLength(rawBody, "utf8");
  console.log("[extract-timestamps-from-description] request body bytes:", bodyBytes);
  console.log("[extract-timestamps-from-description] request body raw:", rawBody);

  let body: Body;
  try {
    body = (rawBody ? JSON.parse(rawBody) : {}) as Body;
  } catch (error) {
    console.error("[extract-timestamps-from-description] invalid JSON body:", error);
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const youtubeUrl = String(body.youtubeUrl ?? "").trim();
  const streamVideoId = String(body.streamVideoId ?? "").trim();
  console.log(
    "[extract-timestamps-from-description] parsed body keys:",
    Object.keys(body as Record<string, unknown>)
  );

  if (streamVideoId) {
    try {
      const accountId = env.cloudflareStream.accountId()?.trim();
      const apiToken = env.cloudflareStream.apiToken()?.trim();
      const customerSubdomain = env.cloudflareStream.customerSubdomain()?.trim();
      if (!accountId || !apiToken || !customerSubdomain) {
        return NextResponse.json(
          { error: "Cloudflare Stream is not configured." },
          { status: 500 }
        );
      }
      await setCloudflareStreamVideoDownloadable({ accountId, apiToken, videoId: streamVideoId });
      const publicVideoUrl = buildCloudflareDownloadUrl(customerSubdomain, streamVideoId);
      const result = await extractTutorialStructureFromPublicVideoUrl(publicVideoUrl, "video/mp4");
      return NextResponse.json({
        steps: result.steps.map((s) => ({
          stepName: s.stepName,
          description: s.description,
          start_time: s.start_time,
          end_time: s.end_time
        })),
        materialsText: result.materialsText,
        toolsText: result.toolsText,
        estimated: result.estimated
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Extraction failed";
      console.error("[extract-timestamps-from-description] stream ERROR:", e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (!youtubeUrl) {
    return NextResponse.json(
      { error: "Provide a YouTube URL or Cloudflare Stream video id first." },
      { status: 400 }
    );
  }

  const videoId = extractYouTubeVideoId(youtubeUrl);
  if (!videoId) {
    return NextResponse.json({ error: "Invalid YouTube URL." }, { status: 400 });
  }

  try {
    const result = await extractTutorialStructureFromYouTubeVideo(youtubeUrl);
    console.log(
      "[extract-timestamps-from-description]",
      JSON.stringify({
        stepCount: result.steps.length,
        estimated: result.estimated,
        hasMaterials: result.materialsText.length > 0 || result.toolsText.length > 0
      })
    );
    return NextResponse.json({
      steps: result.steps.map((s) => ({
        stepName: s.stepName,
        description: s.description,
        start_time: s.start_time,
        end_time: s.end_time
      })),
      materialsText: result.materialsText,
      toolsText: result.toolsText,
      estimated: result.estimated
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Extraction failed";
    console.error("[extract-timestamps-from-description] FULL ERROR:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
