import type { SupabaseClient } from "@supabase/supabase-js";
import { syncPeriodProgress } from "@/lib/magiclog/computeProgress";
import type { MagicLogUserProfile, CompetenceType } from "@/lib/magiclog/types";

export async function ensurePeriodProgressRow(
  supabase: SupabaseClient,
  userId: string,
  period: number
) {
  await supabase.from("period_progress").upsert(
    {
      user_id: userId,
      period,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id,period", ignoreDuplicates: true }
  );
}

export async function applySignedWorkOrderToProgress(
  supabase: SupabaseClient,
  params: {
    userId: string;
    period: number;
    hours: number;
    competenceType: CompetenceType;
    profile?: Pick<MagicLogUserProfile, "trade" | "province"> | null;
  }
) {
  const { userId, period } = params;
  await ensurePeriodProgressRow(supabase, userId, period);
  await syncPeriodProgress(supabase, userId, period, params.profile ?? null);
}

export function estimatePeriodCompletionDate(
  apprenticeshipStart: string | null,
  period: number
): string | null {
  if (!apprenticeshipStart) return null;
  const start = new Date(apprenticeshipStart);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setMonth(end.getMonth() + period * 12);
  return end.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}
