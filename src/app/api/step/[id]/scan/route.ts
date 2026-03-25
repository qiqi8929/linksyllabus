import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const admin = createSupabaseAdminClient();

  const { data: step, error: stepErr } = await admin
    .from("steps")
    .select("id,scan_count")
    .eq("id", params.id)
    .maybeSingle();

  if (stepErr) return NextResponse.json({ error: stepErr.message }, { status: 500 });
  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error: updErr } = await admin
    .from("steps")
    .update({ scan_count: (step.scan_count ?? 0) + 1 })
    .eq("id", params.id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
