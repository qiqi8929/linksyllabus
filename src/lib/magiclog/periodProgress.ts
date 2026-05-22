import type { SupabaseClient } from "@supabase/supabase-js";
import { syncPeriodProgress } from "@/lib/magiclog/computeProgress";
import type { MagicLogUserProfile, CompetenceType } from "@/lib/magiclog/types";

export type PeriodCompletionEstimateInput = {
  totalHours: number;
  hoursRequired: number;
  periodComplete?: boolean;
};

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-CA", { month: "short", year: "numeric" });
}

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

/**
 * Project when the apprentice will finish the current period (always a future month when possible).
 * Uses logged hours pace when calendar period end is already in the past.
 */
export function estimatePeriodCompletionDate(
  apprenticeshipStart: string | null,
  period: number,
  input?: PeriodCompletionEstimateInput
): string | null {
  const now = new Date();
  const hoursRequired = input?.hoursRequired ?? 0;
  const totalHours = input?.totalHours ?? 0;

  if (input?.periodComplete) {
    return formatMonthYear(now);
  }

  let projected: Date;

  if (apprenticeshipStart) {
    const start = new Date(apprenticeshipStart);
    if (!Number.isNaN(start.getTime())) {
      const calendarEnd = addMonths(start, period * 12);
      if (calendarEnd > now && hoursRequired <= 0) {
        return formatMonthYear(calendarEnd);
      }

      const remaining = Math.max(0, hoursRequired - totalHours);
      if (remaining <= 0 && calendarEnd > now) {
        return formatMonthYear(calendarEnd);
      }

      const elapsedMs = Math.max(1, now.getTime() - start.getTime());
      const monthsElapsed = elapsedMs / (30.4375 * 24 * 60 * 60 * 1000);
      const hoursPerMonth =
        totalHours > 0 && monthsElapsed >= 0.5
          ? totalHours / monthsElapsed
          : hoursRequired > 0
            ? hoursRequired / 12
            : 125;
      const monthsRemaining = Math.max(1, Math.ceil(remaining / Math.max(hoursPerMonth, 1)));
      projected = addMonths(now, monthsRemaining);

      if (calendarEnd > now && calendarEnd > projected) {
        projected = calendarEnd;
      }
    } else {
      projected = addMonths(now, 6);
    }
  } else {
    const remaining = Math.max(0, hoursRequired - totalHours);
    const monthsRemaining =
      hoursRequired > 0 ? Math.max(1, Math.ceil(remaining / (hoursRequired / 12))) : 6;
    projected = addMonths(now, monthsRemaining);
  }

  const minFuture = addMonths(now, 1);
  if (projected <= now) {
    projected = minFuture;
  }

  return formatMonthYear(projected);
}
