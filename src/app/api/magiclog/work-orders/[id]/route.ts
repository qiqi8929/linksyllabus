import { NextResponse } from "next/server";
import { persistBluebookPlaySteps } from "@/lib/magiclog/persistPlaySteps";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  BluebookAiStep,
  BluebookVideoRef,
  BluebookWorkOrder
} from "@/lib/magiclog/types";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("bluebook_work_orders")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const videoUrls = (data.video_urls ?? []) as BluebookVideoRef[];
  const video = videoUrls[0];
  let aiSteps = (data.ai_steps ?? []) as BluebookAiStep[];
  if (
    data.include_video &&
    video?.url &&
    aiSteps.length > 0 &&
    !aiSteps.every((s) => s.id)
  ) {
    aiSteps = await persistBluebookPlaySteps(supabase, {
      userId: user.id,
      workOrderId: data.id as string,
      competenceName: String(data.competence_name),
      steps: aiSteps,
      youtubeUrl: video.url,
      durationSec: video.durationSec
    });
    await supabase
      .from("bluebook_work_orders")
      .update({ ai_steps: aiSteps })
      .eq("id", params.id)
      .eq("user_id", user.id);
    data.ai_steps = aiSteps;
  }

  const { data: profile } = await supabase
    .from("users")
    .select(
      "ait_id,trade,current_period,sponsor_name,sponsor_phone,apprenticeship_start_date"
    )
    .eq("id", user.id)
    .maybeSingle();

  let mentorSignatureSignedUrl: string | null = null;
  const sigPath = data.mentor_signature_url as string | null;
  if (sigPath && !sigPath.startsWith("http")) {
    const admin = createSupabaseAdminClient();
    const { data: signed } = await admin.storage
      .from("bluebook-signatures")
      .createSignedUrl(sigPath, 60 * 60);
    mentorSignatureSignedUrl = signed?.signedUrl ?? null;
  } else if (sigPath) {
    mentorSignatureSignedUrl = sigPath;
  }

  return NextResponse.json({
    workOrder: data as BluebookWorkOrder,
    profile,
    mentorSignatureSignedUrl
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (body.ai_steps != null) patch.ai_steps = body.ai_steps;
  if (body.mentor_name != null) patch.mentor_name = String(body.mentor_name).trim();
  if (body.status != null) patch.status = body.status;

  const { error } = await supabase
    .from("bluebook_work_orders")
    .update(patch)
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
