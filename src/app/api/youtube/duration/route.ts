import { NextResponse } from "next/server";
import { fetchYouTubeVideoDurationSec } from "@/lib/youtubeDuration";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const videoId = new URL(req.url).searchParams.get("v")?.trim();
  if (!videoId) {
    return NextResponse.json({ error: "Missing v (YouTube video id)." }, { status: 400 });
  }

  const durationSec = await fetchYouTubeVideoDurationSec(videoId);
  if (durationSec == null) {
    return NextResponse.json({ error: "Could not resolve video duration." }, { status: 404 });
  }

  return NextResponse.json(
    { durationSec },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } }
  );
}
