import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/magiclog/safeNextPath";

/** Client-side Magic Log redirect after email auth (mirrors server resolvePostAuthRedirect). */
export async function resolvePostAuthRedirectClient(nextPath: string): Promise<string> {
  const safe = safeNextPath(nextPath, "/dashboard");
  if (!safe.startsWith("/magiclog")) {
    return safe;
  }

  const supabase = createSupabaseBrowserClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return `/signup?next=${encodeURIComponent(safe)}`;
  }

  const { data: profile } = await supabase
    .from("users")
    .select("bluebook_onboarding_complete, ait_id, trade")
    .eq("id", user.id)
    .maybeSingle();

  const needsOnboarding =
    !profile ||
    !profile.bluebook_onboarding_complete ||
    !profile.ait_id?.trim() ||
    !profile.trade?.trim();

  if (needsOnboarding) {
    return "/magiclog/onboarding";
  }
  return "/magiclog/dashboard";
}
