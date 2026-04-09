import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import {
  extractTutorialStructureFromUploadedVideoBuffer,
  extractTutorialStructureFromYouTubeVideo,
  MAX_VIDEO_BYTES_FOR_GEMINI_ANALYSIS
} from "@/lib/gemini";
import { TUTORIAL_VIDEO_BUCKET } from "@/lib/storageVideoUrl";
import { extractYouTubeVideoId } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  youtubeUrl?: string;
  /** Object path inside `tutorial-videos` bucket, e.g. `{userId}/{uuid}.mp4` */
  storagePath?: string;
};

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".avi")) return "video/x-msvideo";
  return "video/mp4";
}

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
  const storagePath = String(body.storagePath ?? "").trim();

  if (storagePath) {
    if (!storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Invalid storage path." }, { status: 403 });
    }
    try {
      const { data: blob, error: dlErr } = await supabase.storage
        .from(TUTORIAL_VIDEO_BUCKET)
        .download(storagePath);
      if (dlErr || !blob) {
        return NextResponse.json(
          { error: dlErr?.message ?? "Could not read uploaded video." },
          { status: 400 }
        );
      }
      const ab = await blob.arrayBuffer();
      const buffer = Buffer.from(ab);
      if (buffer.length > MAX_VIDEO_BYTES_FOR_GEMINI_ANALYSIS) {
        return NextResponse.json(
          {
            error: `Auto-extract works on videos up to ${Math.floor(
              MAX_VIDEO_BYTES_FOR_GEMINI_ANALYSIS / (1024 * 1024)
            )} MB. Trim or compress the file, or add steps manually.`
          },
          { status: 413 }
        );
      }
      const result = await extractTutorialStructureFromUploadedVideoBuffer(
        buffer,
        mimeFromPath(storagePath)
      );
      console.log(
        "[extract-timestamps-from-description] storage",
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
      console.error("[extract-timestamps-from-description] storage ERROR:", e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (!youtubeUrl) {
    return NextResponse.json(
      { error: "Provide a YouTube URL or upload a video first." },
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
