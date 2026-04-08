import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { extractTutorialStructureFromYouTubeVideo } from "@/lib/gemini";
import { extractYouTubeVideoId } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  youtubeUrl?: string;
};

export async function POST(req: Request) {
  if (!env.geminiApiKey()) {
    return NextResponse.json(
      { error: "AI is not configured (missing GEMINI_API_KEY)." },
      { status: 503 }
    );
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const youtubeUrl = String(body.youtubeUrl ?? "").trim();
  if (!youtubeUrl) {
    return NextResponse.json({ error: "YouTube URL is required." }, { status: 400 });
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
