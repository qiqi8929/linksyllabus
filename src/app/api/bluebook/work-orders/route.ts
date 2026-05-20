import { NextResponse } from "next/server";
import { persistBluebookPlaySteps } from "@/lib/bluebook/persistPlaySteps";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import type { BluebookAiStep, BluebookVideoRef, CompetenceType } from "@/lib/bluebook/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    taskName?: string;
    competenceName?: string;
    competenceType?: CompetenceType;
    period?: number;
    aiSteps?: BluebookAiStep[];
    videoUrls?: BluebookVideoRef[];
    includeVideo?: boolean;
  };

  const task_name = String(body.taskName ?? body.competenceName ?? "").trim();
  const competence_name = String(body.competenceName ?? task_name).trim();
  if (!competence_name) {
    return NextResponse.json({ error: "competenceName is required" }, { status: 400 });
  }

  const competence_type: CompetenceType =
    body.competenceType === "optional" ? "optional" : "mandatory";
  const period = Math.max(1, Math.min(4, Math.floor(Number(body.period ?? 1))));

  const videoUrls = (body.videoUrls ?? []) as BluebookVideoRef[];
  const video = videoUrls[0];
  let aiSteps = (body.aiSteps ?? []) as BluebookAiStep[];

  const { data, error } = await supabase
    .from("bluebook_work_orders")
    .insert({
      user_id: user.id,
      task_name: task_name || competence_name,
      competence_name,
      competence_type,
      period,
      ai_steps: aiSteps,
      video_urls: videoUrls,
      include_video: body.includeVideo !== false,
      status: "draft"
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (video?.url && aiSteps.length > 0 && body.includeVideo !== false) {
    aiSteps = await persistBluebookPlaySteps(supabase, {
      userId: user.id,
      workOrderId: data.id,
      competenceName: competence_name,
      steps: aiSteps,
      youtubeUrl: video.url,
      durationSec: video.durationSec
    });
    await supabase
      .from("bluebook_work_orders")
      .update({ ai_steps: aiSteps })
      .eq("id", data.id)
      .eq("user_id", user.id);
  }

  return NextResponse.json({ id: data.id });
}
