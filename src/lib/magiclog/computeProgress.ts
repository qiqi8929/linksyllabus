import type { SupabaseClient } from "@supabase/supabase-js";
import { PERIOD_REQUIREMENTS, type PeriodRequirements } from "@/lib/magiclog/constants";
import type { BluebookUserProfile, CompetenceType } from "@/lib/magiclog/types";

export type ComputedPeriodProgress = {
  period: number;
  total_hours: number;
  mandatory_completed: number;
  optional_completed: number;
  total_competences: number;
  period_complete: boolean;
  requirements: PeriodRequirements;
};

/** MVP placeholder — trade-specific hour targets will replace this later. */
export function getPeriodRequirements(
  period: number,
  _profile?: Pick<BluebookUserProfile, "trade" | "province"> | null
): PeriodRequirements {
  return PERIOD_REQUIREMENTS[period] ?? PERIOD_REQUIREMENTS[1];
}

/**
 * Recompute period progress from source tables:
 * - Signed work orders → mandatory / optional competence counts
 * - hour_logs → total hours (authoritative for hours)
 */
export async function computePeriodProgress(
  supabase: SupabaseClient,
  userId: string,
  period: number,
  profile?: Pick<BluebookUserProfile, "trade" | "province"> | null
): Promise<ComputedPeriodProgress> {
  const requirements = getPeriodRequirements(period, profile);

  const { data: signedOrders } = await supabase
    .from("bluebook_work_orders")
    .select("id,competence_type,hours")
    .eq("user_id", userId)
    .eq("period", period)
    .eq("status", "signed");

  const { data: hourRows } = await supabase
    .from("hour_logs")
    .select("hours")
    .eq("user_id", userId)
    .eq("period", period);

  let mandatory_completed = 0;
  let optional_completed = 0;
  for (const row of signedOrders ?? []) {
    if (row.competence_type === "optional") optional_completed += 1;
    else mandatory_completed += 1;
  }

  const total_hours = (hourRows ?? []).reduce(
    (sum, row) => sum + Number(row.hours ?? 0),
    0
  );

  const total_competences = mandatory_completed + optional_completed;
  const period_complete =
    total_hours >= requirements.hoursRequired &&
    mandatory_completed >= requirements.mandatoryRequired &&
    optional_completed >= requirements.optionalRequired;

  return {
    period,
    total_hours,
    mandatory_completed,
    optional_completed,
    total_competences,
    period_complete,
    requirements
  };
}

export async function syncPeriodProgress(
  supabase: SupabaseClient,
  userId: string,
  period: number,
  profile?: Pick<BluebookUserProfile, "trade" | "province"> | null
): Promise<ComputedPeriodProgress> {
  const computed = await computePeriodProgress(supabase, userId, period, profile);

  await supabase.from("period_progress").upsert(
    {
      user_id: userId,
      period,
      total_hours: computed.total_hours,
      mandatory_completed: computed.mandatory_completed,
      optional_completed: computed.optional_completed,
      period_complete: computed.period_complete,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id,period" }
  );

  return computed;
}
