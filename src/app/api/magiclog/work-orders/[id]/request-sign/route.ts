import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import {
  buildMentorSignUrl,
  generateSigningToken,
  mergeSigningMetaIntoVideoUrls,
  sendMentorSignSms
} from "@/lib/magiclog/mentorSignLink";
import { isWorkOrderLocked } from "@/lib/magiclog/workOrderStatus";
import { MAGICLOG_WORK_ORDERS_TABLE } from "@/lib/magiclog/tables";
import type { MagicLogVideoRef } from "@/lib/magiclog/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { mentorPhone?: string; mentorName?: string };
  const phone = String(body.mentorPhone ?? "").trim();

  const { data: order, error: loadError } = await supabase
    .from(MAGICLOG_WORK_ORDERS_TABLE)
    .select("id,task_name,competence_name,status,video_urls,mentor_name")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (loadError || !order) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  if (isWorkOrderLocked(order.status)) {
    return NextResponse.json({ error: "Work order is already signed" }, { status: 403 });
  }

  if (!phone) {
    return NextResponse.json({ error: "Mentor phone number is required" }, { status: 400 });
  }

  const { token, expiresAt } = generateSigningToken();
  const video_urls = mergeSigningMetaIntoVideoUrls(
    order.video_urls as MagicLogVideoRef[] | null,
    token,
    expiresAt,
    phone
  );

  const mentor_name =
    String(body.mentorName ?? order.mentor_name ?? "").trim() || null;

  const patch: Record<string, unknown> = {
    video_urls,
    mentor_phone: phone
  };
  if (mentor_name) patch.mentor_name = mentor_name;
  patch.signing_token = token;
  patch.signing_token_expires = expiresAt;

  const { error: updateError } = await supabase
    .from(MAGICLOG_WORK_ORDERS_TABLE)
    .update(patch)
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (updateError) {
    const withoutCols = { video_urls, mentor_name };
    const { error: fallbackError } = await supabase
      .from(MAGICLOG_WORK_ORDERS_TABLE)
      .update(withoutCols)
      .eq("id", params.id)
      .eq("user_id", user.id);
    if (fallbackError) {
      return NextResponse.json({ error: fallbackError.message }, { status: 500 });
    }
  }

  const signUrl = buildMentorSignUrl(params.id, token);
  const taskLabel = order.competence_name || order.task_name || "work order";
  const sms = await sendMentorSignSms(phone, signUrl, taskLabel);

  return NextResponse.json({
    signUrl,
    expiresAt,
    smsSent: sms.sent,
    message: sms.message
  });
}
