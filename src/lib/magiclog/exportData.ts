import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getPeriodRequirements,
  syncPeriodProgress
} from "@/lib/magiclog/computeProgress";
import { estimatePeriodCompletionDate } from "@/lib/magiclog/periodProgress";
import { fetchMagicLogProfile } from "@/lib/magiclog/profile";
import { createSignatureSignedUrl } from "@/lib/magiclog/signatureStorage";
import type { MagicLogAiStep, MagicLogUserProfile, MagicLogWorkOrder } from "@/lib/magiclog/types";

export type HourLogRow = {
  id: string;
  hours: number;
  logged_at: string;
  work_order_id: string | null;
  work_order?: {
    competence_name: string;
    task_name: string | null;
    competence_type: string;
  } | null;
};

export type SignedWorkOrderExport = MagicLogWorkOrder & {
  mentorSignatureSignedUrl: string | null;
};

async function signStoragePath(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const admin = createSupabaseAdminClient();
  return createSignatureSignedUrl(admin, path, 60 * 60);
}

export async function fetchSignedWorkOrdersForPeriod(
  supabase: SupabaseClient,
  userId: string,
  period: number
): Promise<SignedWorkOrderExport[]> {
  const { data } = await supabase
    .from("bluebook_work_orders")
    .select("*")
    .eq("user_id", userId)
    .eq("period", period)
    .eq("status", "signed")
    .order("signed_at", { ascending: true });

  const rows = (data ?? []) as MagicLogWorkOrder[];
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      mentorSignatureSignedUrl: await signStoragePath(row.mentor_signature_url)
    }))
  );
}

export async function fetchHourLogsForPeriod(
  supabase: SupabaseClient,
  userId: string,
  period: number
): Promise<HourLogRow[]> {
  const { data: logs } = await supabase
    .from("hour_logs")
    .select("id,hours,logged_at,work_order_id")
    .eq("user_id", userId)
    .eq("period", period)
    .order("logged_at", { ascending: true });

  const workOrderIds = [
    ...new Set(
      (logs ?? [])
        .map((l) => l.work_order_id as string | null)
        .filter((id): id is string => Boolean(id))
    )
  ];

  const workOrderMap = new Map<
    string,
    { competence_name: string; task_name: string | null; competence_type: string }
  >();

  if (workOrderIds.length > 0) {
    const { data: orders } = await supabase
      .from("bluebook_work_orders")
      .select("id,competence_name,task_name,competence_type")
      .in("id", workOrderIds);

    for (const o of orders ?? []) {
      workOrderMap.set(o.id as string, {
        competence_name: o.competence_name as string,
        task_name: o.task_name as string | null,
        competence_type: o.competence_type as string
      });
    }
  }

  return (logs ?? []).map((row) => ({
    id: row.id as string,
    hours: Number(row.hours),
    logged_at: row.logged_at as string,
    work_order_id: row.work_order_id as string | null,
    work_order: row.work_order_id
      ? workOrderMap.get(row.work_order_id as string) ?? null
      : null
  }));
}

export function displayName(profile: MagicLogUserProfile): string {
  if (profile.email) {
    const local = profile.email.split("@")[0];
    return local.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "Apprentice";
}

export async function fetchMagicLogExportBundle(
  supabase: SupabaseClient,
  userId: string,
  period: number
) {
  const profile = await fetchMagicLogProfile(supabase, userId);
  if (!profile) return null;

  const progress = await syncPeriodProgress(supabase, userId, period, profile);
  const requirements = getPeriodRequirements(period, profile);
  const signedOrders = await fetchSignedWorkOrdersForPeriod(supabase, userId, period);
  const hourLogs = await fetchHourLogsForPeriod(supabase, userId, period);

  const { data: allSigned } = await supabase
    .from("bluebook_work_orders")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "signed")
    .order("period", { ascending: true })
    .order("signed_at", { ascending: true });

  const allSignedWithSigs: SignedWorkOrderExport[] = await Promise.all(
    ((allSigned ?? []) as MagicLogWorkOrder[]).map(async (row) => ({
      ...row,
      mentorSignatureSignedUrl: await signStoragePath(row.mentor_signature_url)
    }))
  );

  return {
    profile,
    period,
    progress,
    requirements,
    signedOrders,
    hourLogs,
    allSignedOrders: allSignedWithSigs,
    apprenticeName: displayName(profile),
    estimatedCompletion: estimatePeriodCompletionDate(
      profile.apprenticeship_start_date,
      period
    )
  };
}

export function parseAiSteps(raw: unknown): MagicLogAiStep[] {
  if (!Array.isArray(raw)) return [];
  return raw as MagicLogAiStep[];
}
