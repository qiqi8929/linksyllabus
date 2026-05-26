import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { ensureMagicLogUser, fetchMagicLogProfile } from "@/lib/magiclog/profile";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMagicLogUser(supabase, { id: user.id, email: user.email });
  const profile = await fetchMagicLogProfile(supabase, user.id);
  return NextResponse.json({ profile });
}

export async function PATCH(req: Request) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Record<string, unknown>;

  const patch: Record<string, unknown> = {};
  if (body.ait_id != null) patch.ait_id = String(body.ait_id).trim();
  if (body.trade != null) patch.trade = String(body.trade).trim();
  if (body.current_period != null) {
    patch.current_period = Math.max(1, Math.min(4, Math.floor(Number(body.current_period))));
  }
  if (body.apprenticeship_start_date != null) {
    patch.apprenticeship_start_date = String(body.apprenticeship_start_date).trim() || null;
  }
  if (body.sponsor_name != null) patch.sponsor_name = String(body.sponsor_name).trim();
  if (body.sponsor_phone != null) patch.sponsor_phone = String(body.sponsor_phone).trim();
  if (body.province != null) patch.province = String(body.province).trim() || "alberta";
  if (body.bluebook_onboarding_complete === true) {
    patch.bluebook_onboarding_complete = true;
  }
  if (body.is_journeyman != null) patch.is_journeyman = Boolean(body.is_journeyman);
  if (body.journeyman_certificate_number != null) {
    patch.journeyman_certificate_number =
      String(body.journeyman_certificate_number).trim() || null;
  }
  if (body.default_mentor_name != null) {
    patch.default_mentor_name = String(body.default_mentor_name).trim() || null;
  }
  if (body.default_mentor_phone != null) {
    patch.default_mentor_phone = String(body.default_mentor_phone).trim() || null;
  }

  await ensureMagicLogUser(supabase, { id: user.id, email: user.email });

  const { error } = await supabase.from("users").update(patch).eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profile = await fetchMagicLogProfile(supabase, user.id);
  return NextResponse.json({ profile });
}
