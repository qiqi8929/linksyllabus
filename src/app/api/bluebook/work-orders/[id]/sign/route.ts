import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { fetchBluebookProfile } from "@/lib/bluebook/profile";
import { applySignedWorkOrderToProgress } from "@/lib/bluebook/periodProgress";
import type { CompetenceType } from "@/lib/bluebook/types";

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

  const body = (await req.json()) as {
    mentorSignatureUrl?: string;
    mentorName?: string;
    hours?: number;
  };

  const hours = Number(body.hours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return NextResponse.json({ error: "Valid hours required" }, { status: 400 });
  }

  const { data: order, error: loadErr } = await supabase
    .from("bluebook_work_orders")
    .select("id,period,competence_type,status")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (loadErr || !order) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  const signedAt = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("bluebook_work_orders")
    .update({
      status: "signed",
      signed_at: signedAt,
      hours,
      mentor_signature_url: body.mentorSignatureUrl ?? null,
      mentor_name: body.mentorName?.trim() || null
    })
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await supabase.from("hour_logs").insert({
    user_id: user.id,
    work_order_id: params.id,
    hours,
    period: order.period
  });

  const profile = await fetchBluebookProfile(supabase, user.id);
  await applySignedWorkOrderToProgress(supabase, {
    userId: user.id,
    period: order.period,
    hours,
    competenceType: order.competence_type as CompetenceType,
    profile
  });

  return NextResponse.json({ ok: true, signedAt });
}
