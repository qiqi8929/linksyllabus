import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { fetchBluebookProfile } from "@/lib/magiclog/profile";
import { syncPeriodProgress } from "@/lib/magiclog/computeProgress";
import { estimatePeriodCompletionDate } from "@/lib/magiclog/periodProgress";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = createSupabaseRouteHandlerClient(req);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await fetchBluebookProfile(supabase, user.id);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const period = profile.current_period ?? 1;
  const computed = await syncPeriodProgress(supabase, user.id, period, profile);
  const reqPeriod = computed.requirements;

  const { data: recentOrders } = await supabase
    .from("bluebook_work_orders")
    .select("id,task_name,competence_name,hours,status,created_at,period")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(8);

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    profile,
    subscriptionStatus: sub?.status ?? "inactive",
    period,
    requirements: reqPeriod,
    progress: {
      total_hours: computed.total_hours,
      mandatory_completed: computed.mandatory_completed,
      optional_completed: computed.optional_completed,
      total_competences: computed.total_competences,
      period_complete: computed.period_complete
    },
    estimatedCompletion: estimatePeriodCompletionDate(
      profile.apprenticeship_start_date,
      period
    ),
    recentWorkOrders: recentOrders ?? []
  });
}
