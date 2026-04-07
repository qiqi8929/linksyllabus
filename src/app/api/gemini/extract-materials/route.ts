import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { extractMaterialsAndToolsFromYouTube } from "@/lib/gemini";
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
