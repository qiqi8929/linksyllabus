import type { SupabaseClient } from "@supabase/supabase-js";
import type { MagicLogUserProfile } from "@/lib/magiclog/types";

const PROFILE_COLUMNS =
  "id,email,ait_id,trade,current_period,apprenticeship_start_date,sponsor_name,sponsor_phone,province,bluebook_onboarding_complete";

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

export async function fetchMagicLogProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<MagicLogUserProfile | null> {
  const { data, error } = await supabase
    .from("users")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[magiclog profile] select failed", error.message);
    return null;
  }

  if (!data) return null;
  return data as MagicLogUserProfile;
}

export function profileNeedsOnboarding(p: MagicLogUserProfile | null): boolean {
  if (!p) return true;
  if (!p.bluebook_onboarding_complete) return true;
  if (!p.ait_id?.trim() || !p.trade?.trim()) return true;
  return false;
}
