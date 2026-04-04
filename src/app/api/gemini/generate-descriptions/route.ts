import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { extractVideoTimestamps, generateStepDescriptions } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body =
  | {
      action?: "descriptions" | undefined;
      tutorialName?: string;
      steps?: Array<{
        stepName?: string;
        videoUrl?: string;
        startTime?: number;
        endTime?: number;
      }>;
    }
  | {
      action: "extractTimestamps";
      /** Transcript + Gemini semantic matching (default). */
      mode?: "timestamps";
      youtubeUrl?: string;
      stepName?: string;
    };

export async function POST(req: Request) {
  if (!env.geminiApiKey()) {
    return NextResponse.json(
      { error: "AI generation is not configured (missing GEMINI_API_KEY)." },
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

  if (body.action === "extractTimestamps") {
    const mode = body.mode ?? "timestamps";
    if (mode !== "timestamps") {
      return NextResponse.json(
        { error: 'Only mode "timestamps" is supported for extractTimestamps.' },
        { status: 400 }
      );
    }
    const youtubeUrl = String(body.youtubeUrl ?? "").trim();
    const stepName = String(body.stepName ?? "").trim();
    if (!youtubeUrl) {
      return NextResponse.json({ error: "YouTube URL is required." }, { status: 400 });
    }
    if (!stepName) {
      return NextResponse.json({ error: "Step name is required." }, { status: 400 });
    }
    try {
      // Transcript is fetched inside extractVideoTimestamps → matchStepsToTranscript
      const result = await extractVideoTimestamps(youtubeUrl, stepName, {
        onGemini: (payload) => {
          if (mode === "timestamps") {
            console.log(
              "[generate-descriptions] mode=timestamps Gemini REST response JSON:",
              JSON.stringify(payload.responseJson, null, 2)
            );
            console.log(
              "[generate-descriptions] mode=timestamps Gemini model text (exact):",
              payload.modelText
            );
          }
        }
      });
      if (mode === "timestamps") {
        console.log(
          "[generate-descriptions] mode=timestamps parsed result:",
          JSON.stringify(result, null, 2)
        );
      }
      return NextResponse.json(result);
    } catch (err: unknown) {
      if (mode === "timestamps") {
        console.error(
          "[generate-descriptions] FULL ERROR:",
          JSON.stringify(err, null, 2),
          (err as Error)?.message,
          (err as Error)?.stack
        );
      }
      const message = err instanceof Error ? err.message : "Timestamp detection failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const tutorialName = String(body.tutorialName ?? "").trim();
  const rawSteps = body.steps ?? [];

  if (!tutorialName) {
    return NextResponse.json({ error: "Tutorial name is required." }, { status: 400 });
  }
  if (rawSteps.length === 0) {
    return NextResponse.json({ error: "Add at least one step." }, { status: 400 });
  }

  const steps = rawSteps.map((s) => ({
    stepName: String(s.stepName ?? "").trim(),
    videoUrl: String(s.videoUrl ?? "").trim(),
    startTime: Number(s.startTime ?? 0),
    endTime: Number(s.endTime ?? 0)
  }));

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s.stepName || !s.videoUrl) {
      return NextResponse.json(
        { error: `Step ${i + 1}: name and video URL are required.` },
        { status: 400 }
      );
    }
    if (
      !Number.isFinite(s.startTime) ||
      !Number.isFinite(s.endTime) ||
      s.endTime <= s.startTime
    ) {
      return NextResponse.json(
        { error: `Step ${i + 1}: end time must be greater than start time (seconds).` },
        { status: 400 }
      );
    }
  }

  try {
    const descriptions = await generateStepDescriptions(tutorialName, steps);
    return NextResponse.json({ descriptions });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
