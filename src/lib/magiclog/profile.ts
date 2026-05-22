import type { SupabaseClient } from "@supabase/supabase-js";
import type { MagicLogUserProfile } from "@/lib/magiclog/types";

type UsersRow = Record<string, unknown>;

function normalizeProfile(row: UsersRow): MagicLogUserProfile {
  const onboarding =
    row.magiclog_onboarding_complete ?? row.bluebook_onboarding_complete ?? false;

  return {
    id: String(row.id),
    email: (row.email as string | null) ?? null,
    ait_id: (row.ait_id as string | null) ?? null,
    trade: (row.trade as string | null) ?? null,
    current_period: Number(row.current_period ?? 1),
    apprenticeship_start_date: (row.apprenticeship_start_date as string | null) ?? null,
    sponsor_name: (row.sponsor_name as string | null) ?? null,
    sponsor_phone: (row.sponsor_phone as string | null) ?? null,
    province: String(row.province ?? "alberta"),
    magiclog_onboarding_complete: Boolean(onboarding)
  };
}

/** Ensure public.users row exists for the signed-in auth user. */
export async function ensureMagicLogUser(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<void> {
  await supabase.from("users").upsert(
    { id: user.id, email: user.email ?? null },
    { onConflict: "id" }
  );
}

/**
 * Load apprentice profile from public.users.
 * Supports magiclog_* and legacy bluebook_* column/table names until migration is applied.
 */
export async function fetchMagicLogProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<MagicLogUserProfile | null> {
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();

  if (error) {
    console.error("[magiclog profile] select failed", error.message);
    return null;
  }

  if (!data) return null;
  return normalizeProfile(data as UsersRow);
}

export function profileNeedsOnboarding(p: MagicLogUserProfile | null): boolean {
  if (!p) return true;
  if (!p.magiclog_onboarding_complete) return true;
  if (!p.ait_id?.trim() || !p.trade?.trim()) return true;
  return false;
}
