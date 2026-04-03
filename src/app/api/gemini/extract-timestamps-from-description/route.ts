import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { extractTimestampsFromDescription } from "@/lib/gemini";
import { extractYouTubeVideoId } from "@/lib/video";
import { fetchYouTubeVideoSnippet } from "@/lib/youtube";

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
  const ytKey = env.youtubeApiKey();
  if (!ytKey) {
    return NextResponse.json(
      { error: "YouTube API is not configured (missing YOUTUBE_API_KEY)." },
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
    const { title, description } = await fetchYouTubeVideoSnippet(videoId, ytKey);
    const steps = await extractTimestampsFromDescription(description, title);
    return NextResponse.json({ steps, videoTitle: title });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
