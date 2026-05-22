import { NextResponse } from "next/server";
import { syncPeriodProgress } from "@/lib/magiclog/computeProgress";
import { fetchBluebookProfile } from "@/lib/magiclog/profile";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const period = Math.max(
    1,
    Math.min(4, Math.floor(Number(new URL(req.url).searchParams.get("period") ?? 1)))
  );

  const profile = await fetchBluebookProfile(supabase, user.id);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const computed = await syncPeriodProgress(supabase, user.id, period, profile);

  return NextResponse.json({
    period,
    requirements: computed.requirements,
    progress: {
      total_hours: computed.total_hours,
      mandatory_completed: computed.mandatory_completed,
      optional_completed: computed.optional_completed,
      total_competences: computed.total_competences,
      period_complete: computed.period_complete
    }
  });
}
