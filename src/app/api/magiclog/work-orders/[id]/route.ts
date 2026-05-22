import { NextResponse } from "next/server";
import { persistMagicLogPlaySteps } from "@/lib/magiclog/persistPlaySteps";
import { createSignatureSignedUrl } from "@/lib/magiclog/signatureStorage";
import { buildQuickLogVideoMeta, isQuickLogWorkOrder } from "@/lib/magiclog/workOrderMode";
import { isWorkOrderLocked } from "@/lib/magiclog/workOrderStatus";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  CompetenceType,
  MagicLogAiStep,
  MagicLogVideoRef,
  MagicLogWorkOrder
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

  const videoUrls = (data.video_urls ?? []) as MagicLogVideoRef[];
  const video = videoUrls[0];
  let aiSteps = (data.ai_steps ?? []) as MagicLogAiStep[];
  if (
    data.include_video &&
    video?.url &&
    aiSteps.length > 0 &&
    !aiSteps.every((s) => s.id)
  ) {
    aiSteps = await persistMagicLogPlaySteps(supabase, {
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
    mentorSignatureSignedUrl = await createSignatureSignedUrl(admin, sigPath, 60 * 60);
  } else if (sigPath) {
    mentorSignatureSignedUrl = sigPath;
  }

  return NextResponse.json({
    workOrder: data as MagicLogWorkOrder,
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

  const { data: existing, error: loadErr } = await supabase
    .from("bluebook_work_orders")
    .select("id,status,video_urls")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (isWorkOrderLocked(existing.status)) {
    return NextResponse.json(
      {
        error:
          "Signed and locked — hours, task name, start date, and other fields cannot be changed."
      },
      { status: 403 }
    );
  }

  const body = (await req.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (body.taskName != null || body.competenceName != null) {
    const name = String(body.taskName ?? body.competenceName ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Task name is required" }, { status: 400 });
    }
    patch.task_name = name;
    patch.competence_name = name;
  }

  if (body.competenceType != null) {
    patch.competence_type =
      body.competenceType === "optional" ? "optional" : "mandatory";
  }

  if (body.period != null) {
    patch.period = Math.max(1, Math.min(4, Math.floor(Number(body.period))));
  }

  if (body.hours != null) {
    const hours = Number(body.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      return NextResponse.json({ error: "Valid hours required" }, { status: 400 });
    }
    patch.hours = hours;
  }

  if (body.ai_steps != null) {
    patch.ai_steps = body.ai_steps;
  }

  if (body.mentor_name != null) {
    patch.mentor_name = String(body.mentor_name).trim() || null;
  }

  if (body.workedDate != null && isQuickLogWorkOrder({ video_urls: existing.video_urls })) {
    const workedDate = String(body.workedDate).trim();
    if (!workedDate) {
      return NextResponse.json({ error: "workedDate is required" }, { status: 400 });
    }
    patch.video_urls = buildQuickLogVideoMeta(workedDate);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("bluebook_work_orders")
    .update(patch)
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
