import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { extractTimestampsForStepsFromYouTubeVideo } from "@/lib/gemini";
import { extractYouTubeVideoId } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  youtubeUrl?: string;
  stepNames?: string[];
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

  const rawNames = body.stepNames;
  const stepNames = Array.isArray(rawNames)
    ? rawNames.map((n) => String(n ?? "").trim()).filter(Boolean)
    : [];

  if (stepNames.length === 0) {
    return NextResponse.json(
      { error: "Add at least one step name before auto-extracting timestamps." },
      { status: 400 }
    );
  }

  try {
    const steps = await extractTimestampsForStepsFromYouTubeVideo(youtubeUrl, stepNames);
    const estimated = steps.some((s) => s.estimated === true);
    console.log(
      "[extract-timestamps-from-description]",
      JSON.stringify({ stepCount: steps.length, estimated })
    );
    return NextResponse.json({ steps, estimated });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Extraction failed";
    console.error("[extract-timestamps-from-description] FULL ERROR:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
