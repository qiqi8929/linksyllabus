import type { SupabaseClient } from "@supabase/supabase-js";
import type { BluebookUserProfile } from "@/lib/magiclog/types";

const PROFILE_COLUMNS =
  "id,email,ait_id,trade,current_period,apprenticeship_start_date,sponsor_name,sponsor_phone,province,bluebook_onboarding_complete";

export async function fetchBluebookProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<BluebookUserProfile | null> {
  const { data, error } = await supabase
    .from("users")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as BluebookUserProfile;
}

export function profileNeedsOnboarding(p: BluebookUserProfile | null): boolean {
  if (!p) return true;
  if (!p.bluebook_onboarding_complete) return true;
  if (!p.ait_id?.trim() || !p.trade?.trim()) return true;
  return false;
}
