import type { SupabaseClient } from "@supabase/supabase-js";
import type { MagicLogUserProfile } from "@/lib/magiclog/types";

const PROFILE_COLUMNS =
  "id,email,ait_id,trade,current_period,apprenticeship_start_date,sponsor_name,sponsor_phone,province,magiclog_onboarding_complete";

export async function fetchMagicLogProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<MagicLogUserProfile | null> {
  const { data, error } = await supabase
    .from("users")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as MagicLogUserProfile;
}

export function profileNeedsOnboarding(p: MagicLogUserProfile | null): boolean {
  if (!p) return true;
  if (!p.magiclog_onboarding_complete) return true;
  if (!p.ait_id?.trim() || !p.trade?.trim()) return true;
  return false;
}
